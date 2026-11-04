import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors.js";
import type { CreateAssetInput, CreateAssetRouteInput, CreateNetworkInput } from "./pag.types.js";

export class PagService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard() {
    const [assetCount, networkCount, routeCount, rateCount, pools, openChecks, assets, networks, routes, rates] = await Promise.all([
      this.prisma.assetRegistry.count(),
      this.prisma.networkDirectory.count(),
      this.prisma.assetRoute.count(),
      this.prisma.conversionRate.count({ where: { active: true } }),
      this.prisma.assetLiquidityPool.findMany({
        include: { asset: { select: { code: true } }, network: { select: { networkName: true } } },
        orderBy: [{ asset: { code: "asc" } }, { network: { networkName: "asc" } }],
      }),
      this.prisma.complianceCheck.count({ where: { result: { in: ["PENDING_REVIEW", "REVIEW"] } } }),
      this.prisma.assetRegistry.findMany({ orderBy: { code: "asc" }, take: 100 }),
      this.prisma.networkDirectory.findMany({ orderBy: { networkName: "asc" }, take: 100 }),
      this.prisma.assetRoute.findMany({
        include: {
          asset: { select: { code: true } },
          sourceNetwork: { select: { networkName: true } },
          destinationNetwork: { select: { networkName: true } },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      this.prisma.conversionRate.findMany({
        where: { active: true },
        include: {
          sourceAsset: { select: { code: true } },
          destinationAsset: { select: { code: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);

    return {
      summary: {
        assets: assetCount,
        networks: networkCount,
        routes: routeCount,
        activeConversionRates: rateCount,
        liquidityPools: pools.length,
        complianceItemsForReview: openChecks,
      },
      assets,
      networks,
      routes,
      rates,
      liquidityPools: pools.map((pool) => ({
        ...pool,
        availableBalance: pool.availableBalance.toString(),
        reservedBalance: pool.reservedBalance.toString(),
      })),
    };
  }

  async listAssets() {
    return this.prisma.assetRegistry.findMany({ orderBy: { code: "asc" } });
  }

  async createAsset(input: CreateAssetInput) {
    return this.prisma.assetRegistry.create({ data: input });
  }

  async listNetworks() {
    return this.prisma.networkDirectory.findMany({ orderBy: { networkName: "asc" } });
  }

  async createNetwork(input: CreateNetworkInput) {
    return this.prisma.networkDirectory.create({ data: input });
  }

  async listRoutes() {
    return this.prisma.assetRoute.findMany({
      include: {
        asset: { select: { code: true } },
        sourceNetwork: { select: { networkName: true } },
        destinationNetwork: { select: { networkName: true } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
  }

  async createRoute(input: CreateAssetRouteInput) {
    if (input.sourceNetworkId === input.destinationNetworkId) {
      throw new ValidationError("Source and destination networks must differ");
    }
    const [asset, source, destination] = await Promise.all([
      this.prisma.assetRegistry.findUnique({ where: { id: input.assetId } }),
      this.prisma.networkDirectory.findUnique({ where: { id: input.sourceNetworkId } }),
      this.prisma.networkDirectory.findUnique({ where: { id: input.destinationNetworkId } }),
    ]);
    if (!asset?.active) throw new ValidationError("Route asset must be active");
    if (!source || !destination) throw new NotFoundError("Network", !source ? input.sourceNetworkId : input.destinationNetworkId);
    return this.prisma.assetRoute.create({
      data: { ...input, costPercent: new Decimal(input.costPercent).toString() },
    });
  }

  async listConversionRates() {
    return this.prisma.conversionRate.findMany({
      include: {
        sourceAsset: { select: { code: true } },
        destinationAsset: { select: { code: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createConversionRate(input: {
    sourceAssetId: string; destinationAssetId: string; rate: string; active: boolean;
  }) {
    const assets = await this.prisma.assetRegistry.findMany({
      where: { id: { in: [input.sourceAssetId, input.destinationAssetId] }, active: true },
      select: { id: true },
    });
    if (assets.length !== 2) throw new ValidationError("Both conversion assets must exist and be active");
    return this.prisma.conversionRate.upsert({
      where: {
        sourceAssetId_destinationAssetId: {
          sourceAssetId: input.sourceAssetId,
          destinationAssetId: input.destinationAssetId,
        },
      },
      create: { ...input, rate: new Decimal(input.rate).toString() },
      update: { rate: new Decimal(input.rate).toString(), active: input.active },
    });
  }

  async listLiquidityPools() {
    const pools = await this.prisma.assetLiquidityPool.findMany({
      include: { asset: { select: { code: true } }, network: { select: { networkName: true } } },
      orderBy: [{ asset: { code: "asc" } }, { network: { networkName: "asc" } }],
    });
    return pools.map((pool) => ({
      ...pool,
      availableBalance: pool.availableBalance.toString(),
      reservedBalance: pool.reservedBalance.toString(),
    }));
  }

  async createLiquidityPool(input: { assetId: string; networkId: string }) {
    const [asset, network] = await Promise.all([
      this.prisma.assetRegistry.findUnique({ where: { id: input.assetId } }),
      this.prisma.networkDirectory.findUnique({ where: { id: input.networkId } }),
    ]);
    if (!asset) throw new NotFoundError("Asset", input.assetId);
    if (!network) throw new NotFoundError("Network", input.networkId);
    return this.prisma.assetLiquidityPool.create({ data: input });
  }

  async updateLiquiditySnapshot(
    poolId: string,
    input: { availableBalance: string; reservedBalance: string },
  ) {
    const pool = await this.prisma.assetLiquidityPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundError("Liquidity pool", poolId);
    return this.prisma.assetLiquidityPool.update({
      where: { id: poolId },
      data: {
        availableBalance: new Decimal(input.availableBalance).toString(),
        reservedBalance: new Decimal(input.reservedBalance).toString(),
      },
    });
  }

  async routeAsset(input: {
    sourceNetworkId: string;
    destinationNetworkId: string;
    assetCode: string;
    amount: string;
  }) {
    const amount = new Decimal(input.amount);
    const asset = await this.prisma.assetRegistry.findUnique({ where: { code: input.assetCode } });
    if (!asset?.active) throw new NotFoundError("Active asset", input.assetCode);
    const [source, destination] = await Promise.all([
      this.prisma.networkDirectory.findUnique({ where: { id: input.sourceNetworkId } }),
      this.prisma.networkDirectory.findUnique({ where: { id: input.destinationNetworkId } }),
    ]);
    if (!source || !destination) throw new NotFoundError("Network", !source ? input.sourceNetworkId : input.destinationNetworkId);
    if (source.status !== "ACTIVE" || destination.status !== "ACTIVE") {
      return { status: "NO_ROUTE", reason: "Source and destination networks must be active", candidates: [] };
    }
    const candidates = await this.prisma.assetRoute.findMany({
      where: {
        sourceNetworkId: source.id,
        destinationNetworkId: destination.id,
        assetId: asset.id,
        active: true,
      },
      orderBy: { priority: "asc" },
    });
    if (candidates.length === 0) {
      return { status: "NO_ROUTE", reason: "No active asset route is configured", candidates: [] };
    }
    const pool = await this.prisma.assetLiquidityPool.findUnique({
      where: { assetId_networkId: { assetId: asset.id, networkId: destination.id } },
    });
    const available = new Decimal(pool?.availableBalance ?? 0);
    const eligible = candidates
      .filter((route) => route.availabilityScore > 0 && available.gte(amount))
      .map((route) => {
        const liquidityRatio = Decimal.min(available.div(amount), 1).times(100);
        const costScore = Decimal.max(new Decimal(0), new Decimal(100).minus(new Decimal(route.costPercent).times(10)));
        const speedScore = Decimal.max(new Decimal(0), new Decimal(100).minus(new Decimal(route.estimatedLatencyMs).div(100)));
        const score = new Decimal(route.availabilityScore).times("0.35")
          .plus(new Decimal(100 - route.riskScore).times("0.20"))
          .plus(costScore.times("0.20"))
          .plus(speedScore.times("0.15"))
          .plus(liquidityRatio.times("0.10"));
        return {
          id: route.id,
          priority: route.priority,
          score: score.toDecimalPlaces(2).toString(),
          costPercent: route.costPercent.toString(),
          estimatedLatencyMs: route.estimatedLatencyMs,
          availabilityScore: route.availabilityScore,
          riskScore: route.riskScore,
          availableLiquidity: available.toString(),
        };
      })
      .sort((a, b) => Number(b.score) - Number(a.score) || a.priority - b.priority);

    if (eligible.length === 0) {
      return {
        status: "NO_ROUTE",
        reason: "No active route has sufficient destination liquidity and availability",
        candidates: [],
      };
    }
    return {
      status: "ROUTE_SELECTED",
      selected: eligible[0],
      candidates: eligible,
      operationalNote: "This is a route recommendation only; it does not run compliance screening, reserve liquidity, post a ledger entry, or settle value.",
    };
  }

  async listAssetAccounts() {
    return this.prisma.assetAccount.findMany({
      include: { asset: { select: { code: true, name: true, precision: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createAssetAccount(input: {
    accountNumber: string; assetId: string; ownerId: string; ownerType: string;
  }) {
    const asset = await this.prisma.assetRegistry.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new NotFoundError("Asset", input.assetId);
    return this.prisma.assetAccount.create({ data: input });
  }

  async listAssetLedger() {
    const entries = await this.prisma.assetLedger.findMany({
      include: {
        asset: { select: { code: true } },
        debitAccount: { select: { accountNumber: true } },
        creditAccount: { select: { accountNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return entries.map((entry) => ({ ...entry, amount: entry.amount.toString() }));
  }

  async listComplianceChecks() {
    return this.prisma.complianceCheck.findMany({
      include: { asset: { select: { code: true } } },
      orderBy: { checkedAt: "desc" },
      take: 100,
    });
  }

  async createComplianceCheck(input: { reference: string; assetId?: string; details?: Record<string, unknown> }) {
    if (input.assetId && !(await this.prisma.assetRegistry.findUnique({ where: { id: input.assetId } }))) {
      throw new NotFoundError("Asset", input.assetId);
    }
    return this.prisma.complianceCheck.create({
      data: {
        reference: input.reference,
        assetId: input.assetId,
        details: input.details as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async resolveComplianceCheck(id: string, input: { result: string; details?: Record<string, unknown> }, reviewedBy: string) {
    const check = await this.prisma.complianceCheck.findUnique({ where: { id } });
    if (!check) throw new NotFoundError("Compliance review", id);
    if (check.result !== "PENDING_REVIEW" && check.result !== "REVIEW") {
      throw new ConflictError("Compliance review is already resolved");
    }
    return this.prisma.complianceCheck.update({
      where: { id },
      data: {
        result: input.result,
        reviewedBy,
        details: input.details as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
