import { Pool }       from "pg";
import { Decimal }    from "decimal.js";
import { createHash } from "crypto";

/**
 * Risk Engine — Production Decision Engine
 *
 * Position in the switch:
 *   Authentication → Risk Engine → Ledger
 *
 * If risk fails: NO ledger posting occurs.
 *
 * Evaluation pipeline (in order):
 *   1. Blacklist  → BLOCK immediately, skip all other checks
 *   2. Watchlist  → continue but add score penalty
 *   3. Risk profile limits (daily/monthly/single tx)
 *   4. Velocity check (Redis primary, DB secondary)
 *   5. Country/geo rules
 *   6. Device fingerprint check
 *   7. Scoring engine (composite 0–100)
 *   8. Decision: APPROVE / REVIEW / DECLINE / BLOCK
 *
 * Decisions:
 *   BLOCK   — blacklist hit or blocked country, no review possible
 *   DECLINE — score >= decline_threshold (default 70)
 *   REVIEW  — score >= review_threshold (default 30), enter manual_review queue
 *   APPROVE — score < review_threshold, proceed to ledger
 */

import type { RedisClientType } from "redis";

export type RiskDecision = "APPROVE" | "REVIEW" | "DECLINE" | "BLOCK";

export interface RiskInput {
  txRef:        string;
  merchantId?:  string;
  sourceId:     string;   // account, wallet, terminal ID
  amount:       string;
  currency:     string;
  ipAddress?:   string;
  countryCode?: string;   // country of origination
  deviceHash?:  string;   // SHA-256 of device fingerprint
  cardBin?:     string;
  isCrossBorder?: boolean;
  metadata?:    Record<string, unknown>;
}

export interface RiskResult {
  decision:      RiskDecision;
  score:         number;
  factors:       Record<string, number>;  // factor name → score contribution
  blocked:       boolean;
  blockReason?:  string;
  reviewId?:     string;   // set if REVIEW, the manual_review.id
  evalMs:        number;
}

export class RiskError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RiskError";
  }
}

// ── Global score thresholds (overridden per merchant via risk_profiles) ──
const DEFAULT_REVIEW_THRESHOLD  = 30;
const DEFAULT_DECLINE_THRESHOLD = 70;
const VELOCITY_WINDOW_SEC       = 60;    // 1-minute velocity window for real-time checks

/**
 * Evaluate risk for a transaction.
 * This is the main entry point called by the switch core.
 */
export async function evaluate(
  pool:   Pool,
  redis:  RedisClientType,
  input:  RiskInput,
): Promise<RiskResult> {

  const startTime = Date.now();
  const amount    = new Decimal(input.amount);
  const factors:  Record<string, number> = {};

  let score        = 0;
  let blacklisted  = false;
  let blockReason  = "";
  let watchlisted  = false;
  let velocityHit  = false;
  let limitHit     = false;
  let geoBlocked   = false;
  let newDevice    = false;

  // ── 1. Load merchant risk profile ────────────────────────
  const profile = await getMerchantProfile(pool, input.merchantId);
  const reviewThreshold  = profile?.review_threshold  ?? DEFAULT_REVIEW_THRESHOLD;
  const declineThreshold = profile?.decline_threshold ?? DEFAULT_DECLINE_THRESHOLD;

  // ── 2. Blacklist check (STOP — no scoring if hit) ─────────
  const blacklistHit = await checkBlacklist(pool, input);
  if (blacklistHit) {
    blacklisted = true;
    blockReason = blacklistHit.reason ?? `Blacklisted ${blacklistHit.type}: ${blacklistHit.value}`;
    await recordDecision(pool, input, "BLOCK", 100, factors, { blacklist: true });
    return {
      decision:    "BLOCK",
      score:       100,
      factors:     { BLACKLIST: 100 },
      blocked:     true,
      blockReason,
      evalMs:      Date.now() - startTime,
    };
  }

  // ── 3. Watchlist check (score penalty) ───────────────────
  const watchlistHit = await checkWatchlist(pool, input);
  if (watchlistHit) {
    watchlisted = true;
    score      += watchlistHit.score;
    factors.WATCHLIST = watchlistHit.score;
  }

  // ── 4. Profile limit check ────────────────────────────────
  if (profile) {
    if (amount.gt(profile.single_tx_limit)) {
      limitHit = true;
      score   += 40;
      factors.SINGLE_TX_LIMIT_EXCEEDED = 40;
    }

    const dailyTotal = await getDailyTotal(pool, input.merchantId ?? input.sourceId);
    if (dailyTotal.plus(amount).gt(profile.daily_limit)) {
      limitHit = true;
      score   += 35;
      factors.DAILY_LIMIT_EXCEEDED = 35;
    }
  }

  // ── 5. Velocity check (Redis) ─────────────────────────────
  const velocityResult = await checkVelocity(redis, input);
  if (velocityResult.exceeded) {
    velocityHit = true;
    score      += 30;
    factors.VELOCITY_EXCEEDED = 30;
  } else if (velocityResult.high) {
    score      += 15;
    factors.VELOCITY_HIGH = 15;
  }

  // Log velocity event to DB (non-blocking)
  pool.query(
    `INSERT INTO velocity_events (entity_type, entity_id, amount, currency, tx_ref)
     VALUES ('ACCOUNT', $1, $2, $3, $4)`,
    [input.sourceId, input.amount, input.currency, input.txRef],
  ).catch(() => {});

  // ── 6. Country / Geo check ────────────────────────────────
  if (input.countryCode) {
    const geoResult = await checkCountry(pool, input.countryCode);
    if (!geoResult.allowed) {
      geoBlocked  = true;
      blockReason = `Country blocked: ${input.countryCode}`;
      await recordDecision(pool, input, "BLOCK", 100, factors, { geoBlocked: true });
      return {
        decision:    "BLOCK",
        score:       100,
        factors:     { ...factors, GEO_BLOCKED: 100 },
        blocked:     true,
        blockReason,
        evalMs:      Date.now() - startTime,
      };
    }
    if (geoResult.riskScore > 0) {
      score            += geoResult.riskScore;
      factors.GEO_RISK  = geoResult.riskScore;
    }
  }

  // ── 7. Device fingerprint ──────────────────────────────────
  if (input.deviceHash) {
    const deviceResult = await checkDevice(pool, input.deviceHash, input.merchantId);
    if (deviceResult.blocked) {
      await recordDecision(pool, input, "BLOCK", 100, factors, { deviceBlocked: true });
      return {
        decision:    "BLOCK",
        score:       100,
        factors:     { ...factors, DEVICE_BLOCKED: 100 },
        blocked:     true,
        blockReason: "Device fingerprint blocked",
        evalMs:      Date.now() - startTime,
      };
    }
    if (deviceResult.isNew) {
      newDevice        = true;
      score           += 20;
      factors.NEW_DEVICE = 20;
    }
    if (deviceResult.hasFraud) {
      score           += 25;
      factors.DEVICE_FRAUD_HISTORY = 25;
    }
    // Update device last_seen
    await updateDeviceSeen(pool, input.deviceHash, input.merchantId, input.sourceId);
  }

  // ── 8. Scoring rules ─────────────────────────────────────
  const ruleScores = applyScoreRules(input, amount);
  for (const [ruleName, pts] of Object.entries(ruleScores)) {
    score        += pts;
    factors[ruleName] = pts;
  }

  // Cap at 100
  score = Math.min(score, 100);

  // ── 9. Decision ───────────────────────────────────────────
  let decision: RiskDecision;
  let reviewId: string | undefined;

  if (score >= declineThreshold) {
    decision = "DECLINE";
  } else if (score >= reviewThreshold) {
    decision = "REVIEW";
    reviewId = await enqueueReview(pool, input, score, factors);
  } else {
    decision = "APPROVE";
  }

  const evalMs = Date.now() - startTime;

  await recordDecision(pool, input, decision, score, factors, {
    blacklist: blacklisted, watchlist: watchlisted,
    velocity: velocityHit, limit: limitHit,
    geo: geoBlocked, newDevice, evalMs,
  });

  return { decision, score, factors, blocked: false, reviewId, evalMs };
}

// ── Blacklist ────────────────────────────────────────────────

export async function addToBlacklist(
  pool:  Pool,
  input: {
    blacklistType: string;
    value:         string;
    reason?:       string;
    source?:       string;
    addedBy?:      string;
    expiresAt?:    Date;
  },
): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO blacklist (blacklist_type, value, reason, source, added_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (blacklist_type, value) DO UPDATE
       SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at
     RETURNING id`,
    [input.blacklistType, input.value, input.reason ?? null, input.source ?? "MANUAL", input.addedBy ?? null, input.expiresAt ?? null],
  );
  return { id: result.rows[0].id };
}

export async function removeFromBlacklist(pool: Pool, blacklistType: string, value: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM blacklist WHERE blacklist_type = $1 AND value = $2",
    [blacklistType, value],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listBlacklist(pool: Pool, blacklistType?: string, page = 1, pageSize = 50) {
  const where  = blacklistType ? "WHERE blacklist_type = $1" : "";
  const params = blacklistType ? [blacklistType] : [];
  const offset = (page - 1) * pageSize;

  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM blacklist ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, offset]),
    pool.query(`SELECT COUNT(*) FROM blacklist ${where}`, params),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── Watchlist ────────────────────────────────────────────────

export async function addToWatchlist(pool: Pool, input: { entityType: string; entityValue: string; score: number; reason?: string; expiresAt?: Date }): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO watchlist (entity_type, entity_value, score, reason, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (entity_type, entity_value) DO UPDATE SET score = EXCLUDED.score, reason = EXCLUDED.reason
     RETURNING id`,
    [input.entityType, input.entityValue, input.score, input.reason ?? null, input.expiresAt ?? null],
  );
  return { id: result.rows[0].id };
}

// ── Risk Profiles ────────────────────────────────────────────

export async function upsertProfile(pool: Pool, input: {
  merchantId:    string;
  dailyLimit?:   string;
  monthlyLimit?: string;
  singleTxLimit?: string;
  velocityLimit?: number;
  velocityWindowSec?: number;
  reviewThreshold?:  number;
  declineThreshold?: number;
  riskLevel?:    string;
  require3ds?:   boolean;
  allowInternational?: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO risk_profiles
       (merchant_id, daily_limit, monthly_limit, single_tx_limit,
        velocity_limit, velocity_window_sec, review_threshold,
        decline_threshold, risk_level, require_3ds, allow_international)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (merchant_id) DO UPDATE SET
       daily_limit         = COALESCE(EXCLUDED.daily_limit, risk_profiles.daily_limit),
       monthly_limit       = COALESCE(EXCLUDED.monthly_limit, risk_profiles.monthly_limit),
       single_tx_limit     = COALESCE(EXCLUDED.single_tx_limit, risk_profiles.single_tx_limit),
       velocity_limit      = COALESCE(EXCLUDED.velocity_limit, risk_profiles.velocity_limit),
       velocity_window_sec = COALESCE(EXCLUDED.velocity_window_sec, risk_profiles.velocity_window_sec),
       review_threshold    = COALESCE(EXCLUDED.review_threshold, risk_profiles.review_threshold),
       decline_threshold   = COALESCE(EXCLUDED.decline_threshold, risk_profiles.decline_threshold),
       risk_level          = COALESCE(EXCLUDED.risk_level, risk_profiles.risk_level),
       require_3ds         = COALESCE(EXCLUDED.require_3ds, risk_profiles.require_3ds),
       allow_international = COALESCE(EXCLUDED.allow_international, risk_profiles.allow_international),
       updated_at          = NOW()`,
    [
      input.merchantId,
      input.dailyLimit    ?? null,
      input.monthlyLimit  ?? null,
      input.singleTxLimit ?? null,
      input.velocityLimit ?? null,
      input.velocityWindowSec ?? null,
      input.reviewThreshold   ?? null,
      input.declineThreshold  ?? null,
      input.riskLevel         ?? null,
      input.require3ds        ?? null,
      input.allowInternational ?? null,
    ],
  );
}

// ── Manual Review ────────────────────────────────────────────

export async function approveReview(pool: Pool, reviewId: string, approvedBy: string, notes?: string): Promise<void> {
  await pool.query(
    `UPDATE manual_review SET status = 'APPROVED', assigned_to = $1, decision_notes = $2, decided_at = NOW()
     WHERE id = $3 AND status IN ('OPEN','ASSIGNED')`,
    [approvedBy, notes ?? null, reviewId],
  );
}

export async function rejectReview(pool: Pool, reviewId: string, rejectedBy: string, notes?: string): Promise<void> {
  await pool.query(
    `UPDATE manual_review SET status = 'REJECTED', assigned_to = $1, decision_notes = $2, decided_at = NOW()
     WHERE id = $3 AND status IN ('OPEN','ASSIGNED')`,
    [rejectedBy, notes ?? null, reviewId],
  );
}

export async function listReviewQueue(pool: Pool, status = "OPEN", page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM manual_review WHERE status = $1 ORDER BY risk_score DESC, created_at ASC LIMIT $2 OFFSET $3`, [status, pageSize, offset]),
    pool.query("SELECT COUNT(*) FROM manual_review WHERE status = $1", [status]),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── AML Cases ────────────────────────────────────────────────

export async function openAmlCase(pool: Pool, input: {
  transactionRef?: string;
  merchantId?:     string;
  entityType?:     string;
  entityId?:       string;
  riskScore?:      number;
  totalAmount?:    string;
  currency?:       string;
  remarks?:        string;
}): Promise<{ id: string; caseNumber: string }> {

  const seq    = await pool.query<{ nextval: string }>("SELECT NEXTVAL('aml_case_seq')");
  const date   = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const num    = seq.rows[0].nextval.toString().padStart(6, "0");
  const caseNumber = `AML-${date}-${num}`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO aml_cases
       (case_number, transaction_ref, merchant_id, entity_type, entity_id,
        risk_score, total_amount, currency, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      caseNumber,
      input.transactionRef ?? null,
      input.merchantId     ?? null,
      input.entityType     ?? null,
      input.entityId       ?? null,
      input.riskScore      ?? null,
      input.totalAmount    ?? null,
      input.currency       ?? null,
      input.remarks        ?? null,
    ],
  );

  return { id: result.rows[0].id, caseNumber };
}

export async function updateAmlCase(pool: Pool, caseId: string, input: {
  status?:      string;
  investigator?: string;
  remarks?:     string;
  sarFiled?:    boolean;
  sarReference?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE aml_cases SET
       case_status = COALESCE($1, case_status),
       investigator = COALESCE($2, investigator),
       remarks      = COALESCE($3, remarks),
       sar_filed    = COALESCE($4, sar_filed),
       sar_reference = COALESCE($5, sar_reference),
       sar_filed_at  = CASE WHEN $4 = TRUE THEN NOW() ELSE sar_filed_at END,
       closed_at     = CASE WHEN $1 IN ('CLOSED','REPORTED') THEN NOW() ELSE closed_at END,
       updated_at    = NOW()
     WHERE id = $6`,
    [input.status ?? null, input.investigator ?? null, input.remarks ?? null, input.sarFiled ?? null, input.sarReference ?? null, caseId],
  );
}

export async function listAmlCases(pool: Pool, status?: string, page = 1, pageSize = 50) {
  const where  = status ? "WHERE case_status = $1" : "";
  const params = status ? [status] : [];
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM aml_cases ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, offset]),
    pool.query(`SELECT COUNT(*) FROM aml_cases ${where}`, params),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── Dashboard Statistics ─────────────────────────────────────

export async function getDashboardStats(pool: Pool): Promise<{
  todayDecisions: Record<string, number>;
  highRiskCount:  number;
  reviewQueueLen: number;
  openAmlCases:   number;
  blacklistCount: number;
  velocityAlerts: number;
}> {
  const today = new Date(); today.setHours(0,0,0,0);

  const [decisions, highRisk, reviewQueue, amlOpen, blacklistTotal, velocityAlerts] = await Promise.all([
    pool.query<{ decision: string; cnt: string }>(
      "SELECT decision, COUNT(*) as cnt FROM risk_decisions WHERE created_at >= $1 GROUP BY decision",
      [today],
    ),
    pool.query<{ cnt: string }>(
      "SELECT COUNT(*) as cnt FROM risk_decisions WHERE score >= 70 AND created_at >= $1",
      [today],
    ),
    pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM manual_review WHERE status = 'OPEN'"),
    pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM aml_cases WHERE case_status IN ('OPEN','UNDER_REVIEW')"),
    pool.query<{ cnt: string }>("SELECT COUNT(*) as cnt FROM blacklist WHERE (expires_at IS NULL OR expires_at > NOW())"),
    pool.query<{ cnt: string }>(
      "SELECT COUNT(*) as cnt FROM risk_decisions WHERE velocity_hit = TRUE AND created_at >= $1",
      [today],
    ),
  ]);

  const todayDecisions: Record<string, number> = {};
  for (const row of decisions.rows) {
    todayDecisions[row.decision] = parseInt(row.cnt, 10);
  }

  return {
    todayDecisions,
    highRiskCount:  parseInt(highRisk.rows[0].cnt, 10),
    reviewQueueLen: parseInt(reviewQueue.rows[0].cnt, 10),
    openAmlCases:   parseInt(amlOpen.rows[0].cnt, 10),
    blacklistCount: parseInt(blacklistTotal.rows[0].cnt, 10),
    velocityAlerts: parseInt(velocityAlerts.rows[0].cnt, 10),
  };
}

// ── Private helpers ──────────────────────────────────────────

async function getMerchantProfile(pool: Pool, merchantId?: string) {
  if (!merchantId) return null;
  const result = await pool.query(
    "SELECT * FROM risk_profiles WHERE merchant_id = $1 AND active = TRUE",
    [merchantId],
  );
  return result.rows[0] ?? null;
}

async function checkBlacklist(pool: Pool, input: RiskInput): Promise<{ type: string; value: string; reason: string | null } | null> {
  const checks: Array<[string, string | undefined]> = [
    ["IP",       input.ipAddress],
    ["ACCOUNT",  input.sourceId],
    ["MERCHANT", input.merchantId],
    ["CARD_BIN", input.cardBin],
    ["COUNTRY",  input.countryCode],
    ["DEVICE",   input.deviceHash],
  ];

  for (const [type, value] of checks) {
    if (!value) continue;
    const hit = await pool.query<{ reason: string | null }>(
      `SELECT reason FROM blacklist
       WHERE blacklist_type = $1 AND value = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [type, value],
    );
    if (hit.rows.length > 0) return { type, value, reason: hit.rows[0].reason };
  }
  return null;
}

async function checkWatchlist(pool: Pool, input: RiskInput): Promise<{ score: number } | null> {
  const checks = [
    ["ACCOUNT",  input.sourceId],
    ["MERCHANT", input.merchantId],
    ["IP",       input.ipAddress],
  ].filter(([, v]) => v) as Array<[string, string]>;

  let totalScore = 0;
  for (const [type, value] of checks) {
    const hit = await pool.query<{ score: number }>(
      `SELECT score FROM watchlist
       WHERE entity_type = $1 AND entity_value = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [type, value],
    );
    if (hit.rows.length > 0) totalScore += hit.rows[0].score;
  }
  return totalScore > 0 ? { score: totalScore } : null;
}

async function checkVelocity(redis: RedisClientType, input: RiskInput): Promise<{ exceeded: boolean; high: boolean; count: number }> {
  const bucket = Math.floor(Date.now() / 1000 / VELOCITY_WINDOW_SEC);
  const key    = `velocity:${input.sourceId}:${VELOCITY_WINDOW_SEC}:${bucket}`;

  const count  = await redis.incr(key);
  if (count === 1) await redis.expire(key, VELOCITY_WINDOW_SEC * 2);

  const limit  = 100; // default; override from profile
  const exceeded = count > limit;
  const high     = !exceeded && count > limit * 0.8;

  return { exceeded, high, count };
}

async function getDailyTotal(pool: Pool, entityId: string): Promise<Decimal> {
  const today = new Date(); today.setHours(0,0,0,0);
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text as total
     FROM velocity_events
     WHERE entity_id = $1 AND created_at >= $2`,
    [entityId, today],
  );
  return new Decimal(result.rows[0].total);
}

async function checkCountry(pool: Pool, countryCode: string): Promise<{ allowed: boolean; riskScore: number }> {
  const result = await pool.query<{ allowed: boolean; risk_score: number }>(
    "SELECT allowed, risk_score FROM country_rules WHERE country_code = $1",
    [countryCode.toUpperCase()],
  );
  if (result.rows.length === 0) return { allowed: true, riskScore: 5 }; // unknown country: small penalty
  return { allowed: result.rows[0].allowed, riskScore: result.rows[0].risk_score };
}

async function checkDevice(pool: Pool, deviceHash: string, merchantId?: string): Promise<{ isNew: boolean; blocked: boolean; hasFraud: boolean }> {
  const result = await pool.query<{
    is_blocked: boolean; is_trusted: boolean; fraud_count: number; tx_count: number;
  }>(
    `SELECT is_blocked, is_trusted, fraud_count, tx_count
     FROM devices WHERE device_hash = $1 AND (merchant_id = $2 OR merchant_id IS NULL)
     LIMIT 1`,
    [deviceHash, merchantId ?? null],
  );

  if (result.rows.length === 0) {
    // Insert new device record
    await pool.query(
      `INSERT INTO devices (device_hash, merchant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [deviceHash, merchantId ?? null],
    );
    return { isNew: true, blocked: false, hasFraud: false };
  }

  const d = result.rows[0];
  return {
    isNew:    d.tx_count === 0,
    blocked:  d.is_blocked,
    hasFraud: d.fraud_count > 0,
  };
}

async function updateDeviceSeen(pool: Pool, deviceHash: string, merchantId?: string, accountId?: string): Promise<void> {
  await pool.query(
    `UPDATE devices SET last_seen = NOW(), tx_count = tx_count + 1, account_id = COALESCE($3, account_id)
     WHERE device_hash = $1 AND (merchant_id = $2 OR merchant_id IS NULL)`,
    [deviceHash, merchantId ?? null, accountId ?? null],
  );
}

function applyScoreRules(input: RiskInput, amount: Decimal): Record<string, number> {
  const scores: Record<string, number> = {};
  const now    = new Date();
  const hour   = now.getHours();

  // Amount-based
  if (amount.gte(50000)) scores.AMOUNT_VERY_HIGH = 35;
  else if (amount.gte(10000)) scores.AMOUNT_HIGH = 20;
  else if (amount.gte(5000)) scores.AMOUNT_MEDIUM = 10;

  // Off-hours (before 06:00 or after 22:00)
  if (hour < 6 || hour >= 22) scores.OFF_HOURS = 10;

  // Cross-border
  if (input.isCrossBorder) scores.CROSS_BORDER = 5;

  // Round number (AML signal — e.g. exactly 10000.00, 50000.00)
  const str = amount.toString();
  if (/^[1-9]\d*\.?0*$/.test(str) && amount.mod(1000).isZero()) scores.ROUND_AMOUNT = 10;

  return scores;
}

async function enqueueReview(pool: Pool, input: RiskInput, score: number, factors: Record<string, number>): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO manual_review
       (transaction_ref, merchant_id, amount, currency, risk_score, risk_factors)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (transaction_ref) DO UPDATE SET risk_score = EXCLUDED.risk_score
     RETURNING id`,
    [input.txRef, input.merchantId ?? null, input.amount, input.currency, score, JSON.stringify(factors)],
  );
  return result.rows[0].id;
}

async function recordDecision(
  pool:     Pool,
  input:    RiskInput,
  decision: RiskDecision,
  score:    number,
  factors:  Record<string, number>,
  flags:    Record<string, boolean | number>,
): Promise<void> {
  await pool.query(
    `INSERT INTO risk_decisions
       (tx_ref, merchant_id, amount, currency, decision, score, factors,
        blacklist_hit, watchlist_hit, velocity_hit, limit_hit, geo_blocked, new_device, eval_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      input.txRef,
      input.merchantId ?? null,
      input.amount,
      input.currency,
      decision,
      score,
      JSON.stringify(factors),
      flags.blacklist  ?? false,
      flags.watchlist  ?? false,
      flags.velocity   ?? false,
      flags.limit      ?? false,
      flags.geo        ?? false,
      flags.newDevice  ?? false,
      flags.evalMs     ?? 0,
    ],
  ).catch(() => { /* non-critical */ });
}
