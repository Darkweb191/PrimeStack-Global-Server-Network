import type { PrismaClient } from "@prisma/client";
import type { CreateIntelligenceEventInput } from "./intelligence.types.js";

type StatusCount = { status: string; count: bigint | number };
type CurrencyMetric = {
  currency: string;
  amount: string | null;
  count: bigint | number;
};
type MerchantMetric = {
  merchantId: string;
  merchantCode: string;
  merchantName: string;
  currency: string;
  successfulAmount: string | null;
  successfulTransactions: bigint | number;
};
type StatusMetric = { status: string; count: bigint | number };
type RecentTransaction = {
  reference: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  createdAt: Date;
  merchant: string;
  terminal: string | null;
  route: string | null;
};
type LiquidityMetric = {
  currency: string;
  total: string;
  available: string;
  reserved: string;
  pools: bigint | number;
};

function previousPeriodStart(start: Date, days: number): Date {
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

function countFor(rows: StatusCount[], ...statuses: string[]): number {
  return rows
    .filter((row) => statuses.includes(row.status))
    .reduce((total, row) => total + Number(row.count), 0);
}

export class IntelligenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(days = 30) {
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const previousStart = previousPeriodStart(periodStart, days);

    const [
      currentCounts,
      priorCounts,
      amountByCurrency,
      transferFeesByCurrency,
      merchantGroups,
      hostStatuses,
      terminalStatuses,
      averageLatency,
      recentTransactions,
      settlementStatuses,
      liquidityByCurrency,
      riskStatuses,
      eventCount,
      events,
    ] = (await Promise.all([
      this.prisma.$queryRaw<StatusCount[]>`
        SELECT status::text AS status, COUNT(*) AS count
        FROM "Transaction"
        WHERE "createdAt" >= ${periodStart}
        GROUP BY status
      `,
      this.prisma.$queryRaw<StatusCount[]>`
        SELECT status::text AS status, COUNT(*) AS count
        FROM "Transaction"
        WHERE "createdAt" >= ${previousStart}
          AND "createdAt" < ${periodStart}
        GROUP BY status
      `,
      this.prisma.$queryRaw<CurrencyMetric[]>`
        SELECT currency, COALESCE(SUM(amount), 0)::text AS amount, COUNT(*) AS count
        FROM "Transaction"
        WHERE "createdAt" >= ${periodStart}
          AND status::text IN ('AUTHORIZED', 'CAPTURED', 'SETTLED')
        GROUP BY currency
        ORDER BY currency
      `,
      this.prisma.$queryRaw<CurrencyMetric[]>`
        SELECT currency, COALESCE(SUM("feeAmount"), 0)::text AS amount, COUNT(*) AS count
        FROM "Transfer"
        WHERE "completedAt" >= ${periodStart}
          AND status::text = 'COMPLETED'
        GROUP BY currency
        ORDER BY currency
      `,
      this.prisma.$queryRaw<MerchantMetric[]>`
        SELECT
          t."merchantId" AS "merchantId",
          m.code AS "merchantCode",
          COALESCE(m."displayName", m."legalName") AS "merchantName",
          t.currency,
          COALESCE(SUM(t.amount), 0)::text AS "successfulAmount",
          COUNT(*) AS "successfulTransactions"
        FROM "Transaction" t
        INNER JOIN "Merchant" m ON m.id = t."merchantId"
        WHERE t."createdAt" >= ${periodStart}
          AND t.status::text IN ('AUTHORIZED', 'CAPTURED', 'SETTLED')
        GROUP BY t."merchantId", m.code, m."displayName", m."legalName", t.currency
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<StatusMetric[]>`
        SELECT status::text AS status, COUNT(*) AS count
        FROM "HostConnection"
        GROUP BY status
      `,
      this.prisma.$queryRaw<StatusMetric[]>`
        SELECT status::text AS status, COUNT(*) AS count
        FROM "TerminalHealth"
        GROUP BY status
      `,
      this.prisma.$queryRaw<Array<{ averageDurationMs: number | null }>>`
        SELECT AVG(duration)::float AS "averageDurationMs"
        FROM "TransactionLog"
        WHERE "createdAt" >= ${periodStart}
          AND duration IS NOT NULL
      `,
      this.prisma.$queryRaw<RecentTransaction[]>`
        SELECT
          t.stan AS reference,
          t.type::text AS type,
          t.status::text AS status,
          t.amount::text AS amount,
          t.currency,
          t."createdAt",
          COALESCE(m."displayName", m."legalName") AS merchant,
          terminal.tid AS terminal,
          route.name AS route
        FROM "Transaction" t
        INNER JOIN "Merchant" m ON m.id = t."merchantId"
        LEFT JOIN "Terminal" terminal ON terminal.id = t."terminalId"
        LEFT JOIN "Route" route ON route.id = t."routeId"
        ORDER BY t."createdAt" DESC
        LIMIT 8
      `,
      this.prisma.$queryRaw<StatusMetric[]>`
        SELECT status::text AS status, COUNT(*) AS count
        FROM "SettlementBatch"
        GROUP BY status
      `,
      this.prisma.$queryRaw<LiquidityMetric[]>`
        SELECT
          currency,
          COALESCE(SUM("totalLiquidity"), 0)::text AS total,
          COALESCE(SUM("availableLiquidity"), 0)::text AS available,
          COALESCE(SUM("reservedLiquidity"), 0)::text AS reserved,
          COUNT(*) AS pools
        FROM "LiquidityPool"
        WHERE status = 'ACTIVE'
        GROUP BY currency
        ORDER BY currency
      `,
      this.prisma.$queryRaw<StatusMetric[]>`
        SELECT level AS status, COUNT(*) AS count
        FROM "RiskScore"
        WHERE "createdAt" >= ${periodStart}
        GROUP BY level
        ORDER BY level
      `,
      this.prisma.intelligenceEvent.count(),
      this.listEvents(20),
    ])) as [
      StatusCount[],
      StatusCount[],
      CurrencyMetric[],
      CurrencyMetric[],
      MerchantMetric[],
      StatusMetric[],
      StatusMetric[],
      Array<{ averageDurationMs: number | null }>,
      RecentTransaction[],
      StatusMetric[],
      LiquidityMetric[],
      StatusMetric[],
      number,
      Awaited<ReturnType<IntelligenceService["listEvents"]>>,
    ];

    const successfulStatuses = ["AUTHORIZED", "CAPTURED", "SETTLED"];
    const currentTotal = countFor(
      currentCounts,
      ...currentCounts.map(({ status }) => status),
    );
    const currentSuccessful = countFor(currentCounts, ...successfulStatuses);
    const priorTotal = countFor(
      priorCounts,
      ...priorCounts.map(({ status }) => status),
    );
    const priorSuccessful = countFor(priorCounts, ...successfulStatuses);

    const availabilityRecommendations = hostStatuses
      .filter(({ status }) => status === "ERROR" || status === "DISCONNECTED")
      .map(({ status, count }) => ({
        type: "HOST_AVAILABILITY_REVIEW",
        severity: status === "ERROR" ? "HIGH" : "MEDIUM",
        message: `${Number(count)} host connection(s) are ${status.toLowerCase()}; review host and route status.`,
        evidence: { hostStatus: status, count: Number(count) },
        mode: "RECOMMENDATION_ONLY",
      }));

    return {
      period: {
        days,
        from: periodStart.toISOString(),
        to: new Date().toISOString(),
        comparisonFrom: previousStart.toISOString(),
        comparisonTo: periodStart.toISOString(),
      },
      transactions: {
        currentTotal,
        previousTotal: priorTotal,
        currentSuccessful,
        previousSuccessful: priorSuccessful,
        currentDeclined: countFor(currentCounts, "DECLINED"),
        currentOther:
          currentTotal -
          currentSuccessful -
          countFor(currentCounts, "DECLINED"),
        successRatePercent: currentTotal
          ? Number(((currentSuccessful / currentTotal) * 100).toFixed(2))
          : null,
        previousSuccessRatePercent: priorTotal
          ? Number(((priorSuccessful / priorTotal) * 100).toFixed(2))
          : null,
        successfulVolumeByCurrency: amountByCurrency.map((row) => ({
          currency: row.currency,
          amount: row.amount ?? "0",
          count: Number(row.count),
        })),
      },
      transferFeesByCurrency: transferFeesByCurrency.map((row) => ({
        currency: row.currency,
        fees: row.amount ?? "0",
        completedTransfers: Number(row.count),
      })),
      topMerchants: merchantGroups.map((row) => ({
        merchantId: row.merchantId,
        merchantCode: row.merchantCode,
        merchantName: row.merchantName,
        currency: row.currency,
        successfulAmount: row.successfulAmount ?? "0",
        successfulTransactions: Number(row.successfulTransactions),
      })),
      operations: {
        averageTransactionLogDurationMs:
          averageLatency[0]?.averageDurationMs ?? null,
        hostStatuses: hostStatuses.map(({ status, count }) => ({
          status,
          count: Number(count),
        })),
        terminalStatuses: terminalStatuses.map(({ status, count }) => ({
          status,
          count: Number(count),
        })),
      },
      recentTransactions: recentTransactions.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      settlements: {
        statuses: settlementStatuses.map(({ status, count }) => ({
          status,
          count: Number(count),
        })),
      },
      liquidityPoolsByCurrency: liquidityByCurrency.map((row) => ({
        currency: row.currency,
        total: row.total,
        available: row.available,
        reserved: row.reserved,
        pools: Number(row.pools),
      })),
      riskLevels: riskStatuses.map(({ status, count }) => ({
        level: status,
        count: Number(count),
      })),
      recommendations: availabilityRecommendations,
      forecast: {
        kind: "TWO_PERIOD_LINEAR_BASELINE",
        nextPeriodTransactionCount: Math.max(
          0,
          currentTotal + currentTotal - priorTotal,
        ),
        confidenceScore: null,
        description:
          "Baseline extends the transaction-count change between two equal-length observed periods; it is not a validated predictive model or a decision to change operations.",
      },
      events,
      eventCount,
      safety: {
        mode: "READ_ONLY",
        automaticActionsEnabled: false,
        financialAmountsAreGroupedByCurrency: true,
        revenueAndProfitabilityAreNotInferred: true,
      },
    };
  }

  async listEvents(limit = 100) {
    return this.prisma.intelligenceEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async recordEvent(input: CreateIntelligenceEventInput, createdBy: string) {
    return this.prisma.intelligenceEvent.create({
      data: { ...input, createdBy },
    });
  }
}
