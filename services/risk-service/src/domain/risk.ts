import { Pool }   from "pg";
import { Decimal } from "decimal.js";
import { createClient } from "redis";

/**
 * Risk Service Domain
 *
 * Evaluates every transfer/transaction for fraud risk.
 * Returns a verdict: ALLOW | REVIEW | BLOCK.
 *
 * Evaluation order (first BLOCK wins):
 *   1. Blacklist check (DB lookup, O(1) with index)
 *   2. Velocity check  (Redis counters, sub-millisecond)
 *   3. Threshold check (DB lookup for AML rules)
 *   4. Risk score computation
 *
 * Velocity counters:
 *   Redis is used for velocity windows because we need:
 *   - Sub-millisecond increments
 *   - Automatic TTL-based window expiry
 *   - Atomic increment + read
 *
 *   Key pattern: velocity:{entity_type}:{entity_value}:{window_seconds}:{window_bucket}
 *   Window bucket: Math.floor(now / windowSeconds) — slides every windowSeconds
 */

export type RiskVerdict = "ALLOW" | "REVIEW" | "BLOCK";

export interface RiskInput {
  entityRef:     string;   // transfer_ref or transaction stan
  entityType:    "TRANSFER" | "TRANSACTION";
  amount:        string;
  currency:      string;
  cardNumber?:   string;
  ipAddress?:    string;
  walletId?:     string;
  merchantId?:   string;
  deviceId?:     string;
}

export interface RiskResult {
  verdict:       RiskVerdict;
  riskScore:     number;
  riskLevel:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggeredRules: string[];
  reason?:       string;
}

export class RiskError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RiskError";
  }
}

type RedisClient = ReturnType<typeof createClient>;

/**
 * Evaluate risk for a transfer or transaction.
 */
export async function evaluate(
  pool:   Pool,
  redis:  RedisClient,
  input:  RiskInput,
): Promise<RiskResult> {

  const triggeredRules: string[] = [];
  const reasons:        string[] = [];
  let   verdict:        RiskVerdict = "ALLOW";
  let   score = 0;

  // ── 1. Blacklist check ────────────────────────────────────
  const blacklistHit = await checkBlacklist(pool, input);
  if (blacklistHit) {
    verdict = "BLOCK";
    score = Math.max(score, 95);
    triggeredRules.push(`BLACKLIST:${blacklistHit.entityType}:${blacklistHit.value}`);
    reasons.push(`Blacklisted ${blacklistHit.entityType}: ${blacklistHit.reason ?? "no reason"}`);
  }

  // ── 2. Velocity check ─────────────────────────────────────
  if (verdict !== "BLOCK") {
    const velocityResult = await checkVelocity(pool, redis, input);
    if (velocityResult.violated) {
      if (velocityResult.action === "BLOCK") verdict = "BLOCK";
      else if (velocityResult.action === "REVIEW" && verdict === "ALLOW") verdict = "REVIEW";
      score = Math.max(score, velocityResult.action === "BLOCK" ? 80 : 50);
      triggeredRules.push(...velocityResult.triggeredRules);
      reasons.push(...velocityResult.reasons);
    }
  }

  // ── 3. Threshold (AML) check ──────────────────────────────
  if (verdict !== "BLOCK") {
    const thresholdResult = await checkThreshold(pool, input);
    if (thresholdResult.triggered) {
      if (thresholdResult.action === "BLOCK") verdict = "BLOCK";
      else if (thresholdResult.action === "REVIEW" && verdict === "ALLOW") verdict = "REVIEW";
      score = Math.max(score, 60);
      triggeredRules.push(thresholdResult.ruleName!);
      reasons.push(thresholdResult.reason!);
    }
  }

  // ── 4. Compute composite risk score ───────────────────────
  score = computeScore(input, score, blacklistHit !== null);

  const riskLevel = score >= 80 ? "CRITICAL"
                  : score >= 60 ? "HIGH"
                  : score >= 30 ? "MEDIUM"
                  : "LOW";

  const result: RiskResult = {
    verdict,
    riskScore:     score,
    riskLevel,
    triggeredRules,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };

  // ── 5. Record decision (fire and forget) ─────────────────
  pool.query(
    `INSERT INTO risk_decisions
       (entity_ref, entity_type, verdict, risk_score, risk_level, triggered_rules, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.entityRef,
      input.entityType,
      result.verdict,
      result.riskScore,
      result.riskLevel,
      JSON.stringify(result.triggeredRules),
      result.reason ?? null,
    ],
  ).catch((err) => console.error("[risk] decision log failed:", err.message));

  return result;
}

// ── Private helpers ─────────────────────────────────────────

async function checkBlacklist(
  pool:  Pool,
  input: RiskInput,
): Promise<{ entityType: string; value: string; reason: string | null } | null> {

  const checks: Array<[string, string | undefined]> = [
    ["CARD",     input.cardNumber],
    ["IP",       input.ipAddress],
    ["WALLET",   input.walletId],
    ["MERCHANT", input.merchantId],
    ["DEVICE",   input.deviceId],
  ];

  for (const [type, value] of checks) {
    if (!value) continue;

    const result = await pool.query<{ reason: string | null }>(
      `SELECT reason FROM blacklist
       WHERE entity_type = $1
         AND entity_value = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [type, value],
    );

    if (result.rows.length > 0) {
      return { entityType: type, value, reason: result.rows[0].reason };
    }
  }

  return null;
}

interface VelocityResult {
  violated:      boolean;
  action:        string;
  triggeredRules: string[];
  reasons:       string[];
}

async function checkVelocity(
  pool:  Pool,
  redis: RedisClient,
  input: RiskInput,
): Promise<VelocityResult> {

  const triggeredRules: string[] = [];
  const reasons:        string[] = [];
  let   violated        = false;
  let   action          = "ALLOW";

  const rules = await pool.query<{
    name:           string;
    entity_type:    string;
    window_seconds: number;
    max_count:      number | null;
    max_amount:     string | null;
    action:         string;
  }>(
    "SELECT name, entity_type, window_seconds, max_count, max_amount, action FROM velocity_rules WHERE is_active = TRUE ORDER BY priority ASC",
  );

  for (const rule of rules.rows) {
    const entityValue = getEntityValue(rule.entity_type, input);
    if (!entityValue) continue;

    // Redis key: velocity:{type}:{value}:{window_seconds}:{bucket}
    const bucket     = Math.floor(Date.now() / 1000 / rule.window_seconds);
    const countKey   = `velocity:count:${rule.entity_type}:${entityValue}:${rule.window_seconds}:${bucket}`;
    const amountKey  = `velocity:amount:${rule.entity_type}:${entityValue}:${rule.window_seconds}:${bucket}`;

    // Check count limit
    if (rule.max_count !== null) {
      const count = await redis.incr(countKey);
      if (count === 1) await redis.expire(countKey, rule.window_seconds * 2);

      if (count > rule.max_count) {
        violated = true;
        triggeredRules.push(rule.name);
        reasons.push(`${rule.name}: ${count} transactions in ${rule.window_seconds}s (limit: ${rule.max_count})`);
        if (rule.action === "BLOCK" || action === "ALLOW") action = rule.action;
      }
    }

    // Check amount limit
    if (rule.max_amount !== null) {
      const amount       = new Decimal(input.amount);
      const amountStr    = await redis.get(amountKey);
      const currentTotal = amountStr ? new Decimal(amountStr) : new Decimal(0);
      const newTotal     = currentTotal.plus(amount);

      await redis.set(amountKey, newTotal.toString(), { EX: rule.window_seconds * 2 });

      if (newTotal.gt(rule.max_amount)) {
        violated = true;
        triggeredRules.push(`${rule.name}_AMOUNT`);
        reasons.push(`${rule.name}: total ${newTotal.toString()} in ${rule.window_seconds}s (limit: ${rule.max_amount})`);
        if (rule.action === "BLOCK" || action === "ALLOW") action = rule.action;
      }
    }
  }

  return { violated, action, triggeredRules, reasons };
}

async function checkThreshold(
  pool:  Pool,
  input: RiskInput,
): Promise<{ triggered: boolean; action: string; ruleName?: string; reason?: string }> {

  const rules = await pool.query<{
    name:             string;
    threshold_amount: string;
    action:           string;
  }>(
    `SELECT name, threshold_amount::text, action
     FROM threshold_rules
     WHERE is_active = TRUE
       AND (currency = $1 OR currency IS NULL)
     ORDER BY threshold_amount DESC`,
    [input.currency],
  );

  const amount = new Decimal(input.amount);

  for (const rule of rules.rows) {
    if (amount.gte(rule.threshold_amount)) {
      return {
        triggered: true,
        action:    rule.action,
        ruleName:  rule.name,
        reason:    `${rule.name}: amount ${amount.toString()} ${input.currency} >= threshold ${rule.threshold_amount}`,
      };
    }
  }

  return { triggered: false, action: "ALLOW" };
}

function computeScore(
  input:         RiskInput,
  baseScore:     number,
  blacklistHit:  boolean,
): number {
  let score = baseScore;

  const amount = new Decimal(input.amount);

  // Amount-based risk
  if (amount.gte(50000))     score = Math.max(score, 70);
  else if (amount.gte(10000)) score = Math.max(score, 50);
  else if (amount.gte(5000))  score = Math.max(score, 30);
  else if (amount.gte(1000))  score = Math.max(score, 10);

  // Missing identity signals
  if (!input.ipAddress && !input.walletId) score += 10;

  return Math.min(score, 100);
}

function getEntityValue(entityType: string, input: RiskInput): string | undefined {
  switch (entityType) {
    case "CARD":     return input.cardNumber;
    case "IP":       return input.ipAddress;
    case "WALLET":   return input.walletId;
    case "MERCHANT": return input.merchantId;
    case "DEVICE":   return input.deviceId;
    default:         return undefined;
  }
}
