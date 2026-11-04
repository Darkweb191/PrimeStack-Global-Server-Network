import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { NotFoundError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { redis } from "../../core/redis.js";

/**
 * Fraud Detection Service
 *
 * Provides real-time fraud checks for transactions and transfers:
 *   - Velocity rules (rate limiting per card/IP/merchant)
 *   - Blacklist/whitelist checks (cards, IPs, devices, wallets)
 *   - AML (Anti-Money Laundering) threshold checks
 *   - Risk scoring (0-100 with LOW/MEDIUM/HIGH/CRITICAL levels)
 *
 * Rules can be global or merchant-specific. The service uses Redis
 * for velocity counters with sliding windows.
 */
export class FraudService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Evaluate all fraud rules for a transaction.
   * Returns a verdict: ALLOW, REVIEW, or BLOCK.
   */
  async evaluate(input: {
    merchantId?: string;
    cardNumber?: string;
    ipAddress?: string;
    walletAddress?: string;
    amount: string;
    currency: string;
    deviceId?: string;
  }): Promise<{
    verdict: string;
    riskScore: number;
    riskLevel: string;
    triggeredRules: string[];
    reason?: string;
  }> {
    let verdict = "ALLOW";
    let maxScore = 0;
    const triggeredRules: string[] = [];
    const reasons: string[] = [];

    // 1. Check blacklist
    const blacklistChecks = await this.checkBlacklist(input);
    if (blacklistChecks.blocked) {
      verdict = "BLOCK";
      triggeredRules.push(...blacklistChecks.triggered);
      reasons.push(blacklistChecks.reason ?? "Blacklisted entity");
    }

    // 2. Check velocity rules
    const velocityResult = await this.checkVelocity(input);
    if (velocityResult.violated) {
      if (velocityResult.action === "BLOCK") verdict = "BLOCK";
      if (velocityResult.action === "REVIEW" && verdict === "ALLOW") verdict = "REVIEW";
      triggeredRules.push(...velocityResult.triggered);
      reasons.push(...velocityResult.reasons);
    }

    // 3. Check amount threshold (AML)
    const amlResult = await this.checkAml(input);
    if (amlResult.flagged) {
      if (amlResult.action === "BLOCK") verdict = "BLOCK";
      if (amlResult.action === "REVIEW" && verdict === "ALLOW") verdict = "REVIEW";
      triggeredRules.push(amlResult.ruleName!);
      reasons.push(amlResult.reason!);
    }

    // 4. Compute risk score
    maxScore = this.computeRiskScore(input, blacklistChecks.blocked, velocityResult.violated);

    const riskLevel = maxScore >= 80 ? "CRITICAL" : maxScore >= 60 ? "HIGH" : maxScore >= 30 ? "MEDIUM" : "LOW";

    // Record risk score
    await this.prisma.riskScore.create({
      data: {
        entityType: "TRANSACTION",
        entityId: input.cardNumber ?? input.walletAddress ?? input.ipAddress ?? "unknown",
        score: maxScore,
        level: riskLevel,
        factors: {
          blacklistHit: blacklistChecks.blocked,
          velocityViolation: velocityResult.violated,
          amlFlagged: amlResult.flagged,
          triggeredRules,
        },
        recommendation: verdict,
      },
    });

    logger.info(
      { verdict, riskScore: maxScore, riskLevel, triggeredRules },
      "Fraud evaluation complete",
    );

    return {
      verdict,
      riskScore: maxScore,
      riskLevel,
      triggeredRules,
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
    };
  }

  // ── Blacklist / Whitelist ────────────────────────

  async addToBlacklist(type: string, value: string, reason?: string, expiresAt?: Date) {
    return this.prisma.blacklistEntry.upsert({
      where: { type_value: { type, value } },
      update: { reason, expiresAt, source: "MANUAL" },
      create: { type, value, reason, expiresAt, source: "MANUAL" },
    });
  }

  async removeFromBlacklist(type: string, value: string) {
    try {
      await this.prisma.blacklistEntry.delete({
        where: { type_value: { type, value } },
      });
      return true;
    } catch {
      return false;
    }
  }

  async addToWhitelist(type: string, value: string, reason?: string, expiresAt?: Date) {
    return this.prisma.whitelistEntry.upsert({
      where: { type_value: { type, value } },
      update: { reason, expiresAt },
      create: { type, value, reason, expiresAt },
    });
  }

  async listBlacklist(filters: { type?: string; page: number; pageSize: number }) {
    const where: Prisma.BlacklistEntryWhereInput = {};
    if (filters.type) where.type = filters.type;

    const [entries, total] = await Promise.all([
      this.prisma.blacklistEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.blacklistEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Fraud Rules ──────────────────────────────────

  async createRule(input: {
    name: string;
    type: "VELOCITY" | "BLACKLIST" | "WHITELIST" | "AML" | "RISK_SCORE" | "THRESHOLD";
    condition: Record<string, unknown>;
    action: string;
    priority: number;
    merchantId?: string;
  }) {
    return this.prisma.fraudRule.create({
      data: {
        name: input.name,
        type: input.type,
        status: "ACTIVE",
        condition: input.condition as Prisma.InputJsonValue,
        action: input.action,
        priority: input.priority,
        merchantId: input.merchantId,
      },
    });
  }

  async listRules(filters: { type?: string; status?: string; merchantId?: string; page: number; pageSize: number }) {
    const where: Prisma.FraudRuleWhereInput = {};
    if (filters.type) where.type = filters.type as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.merchantId) where.merchantId = filters.merchantId;

    const [rules, total] = await Promise.all([
      this.prisma.fraudRule.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.fraudRule.count({ where }),
    ]);

    return {
      data: rules,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Risk Scores ─────────────────────────────────

  async getRiskScores(filters: { entityType?: string; level?: string; page: number; pageSize: number }) {
    const where: Prisma.RiskScoreWhereInput = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.level) where.level = filters.level;

    const [scores, total] = await Promise.all([
      this.prisma.riskScore.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.riskScore.count({ where }),
    ]);

    return {
      data: scores,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Private Helpers ──────────────────────────────

  private async checkBlacklist(input: {
    cardNumber?: string;
    ipAddress?: string;
    walletAddress?: string;
    deviceId?: string;
  }): Promise<{ blocked: boolean; triggered: string[]; reason?: string }> {
    const triggered: string[] = [];
    const checks: Array<[string, string | undefined]> = [
      ["CARD", input.cardNumber],
      ["IP", input.ipAddress],
      ["WALLET", input.walletAddress],
      ["DEVICE", input.deviceId],
    ];

    for (const [type, value] of checks) {
      if (!value) continue;

      // Check whitelist first (whitelisted entries skip blacklist)
      const whitelisted = await this.prisma.whitelistEntry.findUnique({
        where: { type_value: { type, value } },
      });
      if (whitelisted) continue;

      const blacklisted = await this.prisma.blacklistEntry.findUnique({
        where: { type_value: { type, value } },
      });

      if (blacklisted && (!blacklisted.expiresAt || blacklisted.expiresAt > new Date())) {
        triggered.push(`BLACKLIST_${type}:${value}`);
        return {
          blocked: true,
          triggered,
          reason: `${type} ${value} is blacklisted: ${blacklisted.reason ?? "no reason given"}`,
        };
      }
    }

    return { blocked: false, triggered };
  }

  private async checkVelocity(input: {
    merchantId?: string;
    cardNumber?: string;
    ipAddress?: string;
    walletAddress?: string;
    amount: string;
  }): Promise<{
    violated: boolean;
    action: string;
    triggered: string[];
    reasons: string[];
  }> {
    const rules = await this.prisma.fraudRule.findMany({
      where: {
        type: "VELOCITY",
        status: "ACTIVE",
        ...(input.merchantId ? { OR: [{ merchantId: null }, { merchantId: input.merchantId }] } : {}),
      },
      orderBy: { priority: "asc" },
    });

    const triggered: string[] = [];
    const reasons: string[] = [];
    let action = "ALLOW";
    let violated = false;

    for (const rule of rules) {
      const condition = rule.condition as {
        windowSeconds: number;
        maxCount: number;
        entity: string; // "CARD", "IP", "WALLET", "MERCHANT"
        maxAmount?: number;
      };

      const entityValue =
        condition.entity === "CARD" ? input.cardNumber :
        condition.entity === "IP" ? input.ipAddress :
        condition.entity === "WALLET" ? input.walletAddress :
        condition.entity === "MERCHANT" ? input.merchantId : undefined;

      if (!entityValue) continue;

      const redisKey = `velocity:${condition.entity}:${entityValue}:${condition.windowSeconds}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, condition.windowSeconds);
      }

      if (count > condition.maxCount) {
        violated = true;
        triggered.push(rule.name);
        reasons.push(`Velocity exceeded: ${count} transactions in ${condition.windowSeconds}s (limit: ${condition.maxCount})`);
        if (rule.action === "BLOCK") action = "BLOCK";
        else if (rule.action === "REVIEW" && action === "ALLOW") action = "REVIEW";
      }

      // Check amount-based velocity
      if (condition.maxAmount) {
        const amountKey = `velocity_amount:${condition.entity}:${entityValue}:${condition.windowSeconds}`;
        const totalAmountStr = await redis.get(amountKey);
        const totalAmount = totalAmountStr ? new Decimal(totalAmountStr) : new Decimal(0);
        const newTotal = totalAmount.plus(new Decimal(input.amount));

        await redis.set(amountKey, newTotal.toString(), "EX", condition.windowSeconds);

        if (newTotal.gte(condition.maxAmount)) {
          violated = true;
          triggered.push(`${rule.name}_AMOUNT`);
          reasons.push(`Amount velocity exceeded: ${newTotal.toString()} in ${condition.windowSeconds}s (limit: ${condition.maxAmount})`);
          if (rule.action === "BLOCK") action = "BLOCK";
          else if (rule.action === "REVIEW" && action === "ALLOW") action = "REVIEW";
        }
      }
    }

    return { violated, action, triggered, reasons };
  }

  private async checkAml(input: {
    merchantId?: string;
    amount: string;
    currency: string;
  }): Promise<{ flagged: boolean; action: string; ruleName?: string; reason?: string }> {
    const rules = await this.prisma.fraudRule.findMany({
      where: {
        type: "AML",
        status: "ACTIVE",
        ...(input.merchantId ? { OR: [{ merchantId: null }, { merchantId: input.merchantId }] } : {}),
      },
      orderBy: { priority: "asc" },
    });

    for (const rule of rules) {
      const condition = rule.condition as {
        thresholdAmount: number;
        currency?: string;
        action: string;
      };

      if (condition.currency && condition.currency !== input.currency) continue;

      if (new Decimal(input.amount).gte(condition.thresholdAmount)) {
        return {
          flagged: true,
          action: rule.action,
          ruleName: rule.name,
          reason: `AML threshold exceeded: ${input.amount} ${input.currency} >= ${condition.thresholdAmount}`,
        };
      }
    }

    return { flagged: false, action: "ALLOW" };
  }

  private computeRiskScore(
    input: { amount: string; ipAddress?: string; cardNumber?: string },
    blacklistHit: boolean,
    velocityViolated: boolean,
  ): number {
    let score = 0;

    // Amount-based scoring
    const amount = new Decimal(input.amount);
    if (amount.gte(10000)) score += 40;
    else if (amount.gte(5000)) score += 25;
    else if (amount.gte(1000)) score += 10;

    // Blacklist hit
    if (blacklistHit) score += 50;

    // Velocity violation
    if (velocityViolated) score += 30;

    // Unknown IP
    if (!input.ipAddress) score += 5;

    // No card number (wallet-only)
    if (!input.cardNumber) score += 5;

    return Math.min(score, 100);
  }
}
