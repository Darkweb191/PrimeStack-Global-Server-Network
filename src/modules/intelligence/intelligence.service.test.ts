import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { IntelligenceService } from "./intelligence.service.js";

function createPrismaMock() {
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        { status: "AUTHORIZED", count: 8 },
        { status: "DECLINED", count: 2 },
      ])
      .mockResolvedValueOnce([
        { status: "AUTHORIZED", count: 4 },
        { status: "DECLINED", count: 1 },
      ])
      .mockResolvedValueOnce([{ currency: "USD", amount: "100.00", count: 8 }])
      .mockResolvedValueOnce([{ currency: "USD", amount: "2.50", count: 3 }])
      .mockResolvedValueOnce([
        {
          merchantId: "merchant-1",
          merchantCode: "M1",
          merchantName: "Merchant One",
          currency: "USD",
          successfulAmount: "100.00",
          successfulTransactions: 8,
        },
      ])
      .mockResolvedValueOnce([
        { status: "ERROR", count: 1 },
        { status: "CONNECTED", count: 2 },
      ])
      .mockResolvedValueOnce([{ status: "ONLINE", count: 7 }])
      .mockResolvedValueOnce([{ averageDurationMs: 24 }])
      .mockResolvedValueOnce([
        {
          reference: "000001",
          type: "PURCHASE",
          status: "AUTHORIZED",
          amount: "50.00",
          currency: "USD",
          createdAt: new Date("2026-10-23T01:00:00.000Z"),
          merchant: "Merchant One",
          terminal: "TERM-1",
          route: "Internal",
        },
      ])
      .mockResolvedValueOnce([
        { status: "COMPLETED", count: 4 },
        { status: "OPEN", count: 2 },
      ])
      .mockResolvedValueOnce([
        {
          currency: "USD",
          total: "1000.00",
          available: "750.00",
          reserved: "250.00",
          pools: 1,
        },
      ])
      .mockResolvedValueOnce([
        { status: "HIGH", count: 2 },
        { status: "LOW", count: 5 },
      ]),
    intelligenceEvent: {
      count: vi.fn().mockResolvedValue(25),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }) => ({ id: "event-1", ...data })),
    },
  };
  return { prisma: prisma as unknown as PrismaClient };
}

describe("IntelligenceService", () => {
  let mock: ReturnType<typeof createPrismaMock>;
  let service: IntelligenceService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new IntelligenceService(mock.prisma);
  });

  it("summarizes observed activity and returns recommendations without operational actions", async () => {
    const dashboard = await service.getDashboard(7);

    expect(dashboard.transactions.currentTotal).toBe(10);
    expect(dashboard.transactions.currentSuccessful).toBe(8);
    expect(dashboard.transactions.currentDeclined).toBe(2);
    expect(dashboard.transactions.successRatePercent).toBe(80);
    expect(dashboard.transactions.successfulVolumeByCurrency[0]).toMatchObject({
      currency: "USD",
      amount: "100.00",
      count: 8,
    });
    expect(dashboard.transferFeesByCurrency[0]).toMatchObject({
      currency: "USD",
      fees: "2.50",
      completedTransfers: 3,
    });
    expect(dashboard.topMerchants[0]).toMatchObject({
      merchantCode: "M1",
      successfulTransactions: 8,
    });
    expect(dashboard.recommendations[0]).toMatchObject({
      severity: "HIGH",
      mode: "RECOMMENDATION_ONLY",
    });
    expect(dashboard.forecast.kind).toBe("TWO_PERIOD_LINEAR_BASELINE");
    expect(dashboard.forecast.nextPeriodTransactionCount).toBe(15);
    expect(dashboard.safety.automaticActionsEnabled).toBe(false);
    expect(dashboard.eventCount).toBe(25);
    expect(dashboard.recentTransactions[0]).toMatchObject({
      reference: "000001",
      merchant: "Merchant One",
      terminal: "TERM-1",
    });
    expect(dashboard.settlements.statuses).toEqual([
      { status: "COMPLETED", count: 4 },
      { status: "OPEN", count: 2 },
    ]);
    expect(dashboard.liquidityPoolsByCurrency[0]).toMatchObject({
      currency: "USD",
      available: "750.00",
      reserved: "250.00",
    });
    expect(dashboard.riskLevels).toContainEqual({ level: "HIGH", count: 2 });
    expect(mock.prisma.$queryRaw).toHaveBeenCalledTimes(12);
  });

  it("persists event records with the authenticated actor and does not initiate an action", async () => {
    const event = await service.recordEvent(
      {
        eventType: "ROUTE_LATENCY_ANOMALY",
        sourceSystem: "SWITCH_CORE",
        confidenceScore: 87.5,
        summary: "Route response latency exceeded the observed baseline.",
      },
      "admin-1",
    );

    expect(event).toMatchObject({
      eventType: "ROUTE_LATENCY_ANOMALY",
      createdBy: "admin-1",
    });
    expect(mock.prisma.intelligenceEvent.create).toHaveBeenCalledOnce();
  });
});
