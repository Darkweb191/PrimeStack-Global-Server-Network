import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotFoundError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

/**
 * Treasury Service
 *
 * Manages the platform's financial reserves and liquidity:
 *   - Float management (operational float for each currency)
 *   - Liquidity pools (available vs reserved liquidity)
 *   - Reserve accounts (settlement, contingency reserves)
 *   - Low balance alerts and auto-replenishment triggers
 *
 * All treasury accounts are linked to the ledger for consistency.
 */
export class TreasuryService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
  ) {}

  // ── Float Accounts ──────────────────────────────

  async createFloatAccount(input: {
    name: string;
    currency: string;
    minBalance?: string;
    maxBalance?: string;
    initialBalance?: string;
  }) {
    // Create a ledger account for this float
    const accountCode = `FLOAT-${input.name}-${input.currency}`;
    const account = await this.ledgerService.createAccount({
      code: accountCode,
      name: `Float: ${input.name}`,
      type: "ASSET",
      subtype: "FLOAT",
      currency: input.currency,
    });

    const float = await this.prisma.floatAccount.create({
      data: {
        name: input.name,
        accountId: account.id,
        currency: input.currency,
        balance: input.initialBalance ? new Decimal(input.initialBalance).toNumber() : 0,
        minBalance: input.minBalance ? new Decimal(input.minBalance).toNumber() : 0,
        maxBalance: input.maxBalance ? new Decimal(input.maxBalance).toNumber() : undefined,
      },
      include: { account: true },
    });

    logger.info({ floatId: float.id, name: input.name, currency: input.currency }, "Float account created");
    return float;
  }

  async getFloatAccount(id: string) {
    const float = await this.prisma.floatAccount.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!float) throw new NotFoundError("Float account", id);
    return float;
  }

  async listFloatAccounts(currency?: string) {
    const where: Prisma.FloatAccountWhereInput = {};
    if (currency) where.currency = currency;

    return this.prisma.floatAccount.findMany({
      where,
      include: { account: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async checkLowBalance(): Promise<Array<{ id: string; name: string; balance: string; minBalance: string; currency: string }>> {
    const floats = await this.prisma.floatAccount.findMany({
      where: { status: "ACTIVE" },
    });

    const lowBalance: Array<{ id: string; name: string; balance: string; minBalance: string; currency: string }> = [];

    for (const float of floats) {
      const balance = new Decimal(float.balance);
      const min = new Decimal(float.minBalance);
      if (balance.lt(min)) {
        lowBalance.push({
          id: float.id,
          name: float.name,
          balance: balance.toString(),
          minBalance: min.toString(),
          currency: float.currency,
        });
      }
    }

    if (lowBalance.length > 0) {
      logger.warn({ count: lowBalance.length }, "Low balance float accounts detected");
    }

    return lowBalance;
  }

  // ── Liquidity Pools ──────────────────────────────

  async createLiquidityPool(input: {
    name: string;
    currency: string;
    totalLiquidity: string;
  }) {
    return this.prisma.liquidityPool.create({
      data: {
        name: input.name,
        currency: input.currency,
        totalLiquidity: new Decimal(input.totalLiquidity).toNumber(),
        availableLiquidity: new Decimal(input.totalLiquidity).toNumber(),
      },
    });
  }

  async getLiquidityPool(id: string) {
    const pool = await this.prisma.liquidityPool.findUnique({ where: { id } });
    if (!pool) throw new NotFoundError("Liquidity pool", id);
    return pool;
  }

  async listLiquidityPools(currency?: string) {
    const where: Prisma.LiquidityPoolWhereInput = {};
    if (currency) where.currency = currency;
    return this.prisma.liquidityPool.findMany({ where, orderBy: { createdAt: "desc" } });
  }

  async updateLiquidity(id: string, input: { totalLiquidity?: string; reservedLiquidity?: string }) {
    const pool = await this.prisma.liquidityPool.findUnique({ where: { id } });
    if (!pool) throw new NotFoundError("Liquidity pool", id);

    const total = input.totalLiquidity ? new Decimal(input.totalLiquidity) : new Decimal(pool.totalLiquidity);
    const reserved = input.reservedLiquidity ? new Decimal(input.reservedLiquidity) : new Decimal(pool.reservedLiquidity);
    const available = total.minus(reserved);
    const utilizationRate = total.gt(0) ? reserved.div(total).times(100).toNumber() : 0;

    return this.prisma.liquidityPool.update({
      where: { id },
      data: {
        totalLiquidity: total.toNumber(),
        reservedLiquidity: reserved.toNumber(),
        availableLiquidity: available.toNumber(),
        utilizationRate,
      },
    });
  }

  // ── Reserve Accounts ────────────────────────────

  async createReserveAccount(input: {
    name: string;
    type: string; // "SETTLEMENT", "RESERVE", "CONTINGENCY"
    currency: string;
    minReserve?: string;
    initialBalance?: string;
  }) {
    return this.prisma.reserveAccount.create({
      data: {
        name: input.name,
        type: input.type,
        currency: input.currency,
        balance: input.initialBalance ? new Decimal(input.initialBalance).toNumber() : 0,
        minReserve: input.minReserve ? new Decimal(input.minReserve).toNumber() : 0,
      },
    });
  }

  async listReserveAccounts(type?: string) {
    const where: Prisma.ReserveAccountWhereInput = {};
    if (type) where.type = type;
    return this.prisma.reserveAccount.findMany({ where, orderBy: { createdAt: "desc" } });
  }

  async getReserveAccount(id: string) {
    const reserve = await this.prisma.reserveAccount.findUnique({ where: { id } });
    if (!reserve) throw new NotFoundError("Reserve account", id);
    return reserve;
  }
}
