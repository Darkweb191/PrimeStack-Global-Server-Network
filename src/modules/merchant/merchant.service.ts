import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { Decimal } from "../../core/decimal.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type {
  CreateMerchantInput,
  UpdateMerchantInput,
} from "./merchant.types.js";

function money(
  value: string,
  name: string,
  allowZero = true,
  scale = 2,
  integerDigits = 16,
): Decimal {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new ValidationError(`${name} must be a valid amount`);
  }
  if (
    !amount.isFinite() ||
    (allowZero ? amount.lt(0) : amount.lte(0)) ||
    amount.decimalPlaces() > scale ||
    amount.abs().gte(new Decimal(10).pow(integerDigits))
  ) {
    throw new ValidationError(
      `${name} must be ${allowZero ? "non-negative" : "positive"} and fit a decimal(${integerDigits + scale}, ${scale}) amount`,
    );
  }
  return amount;
}

/**
 * Merchant Service
 *
 * Handles the merchant lifecycle:
 *   - Onboarding (create merchant + auto-create KYC record)
 *   - Profile management
 *   - Merchant status transitions
 *   - Merchant-level stats
 */
export class MerchantService {
  constructor(private prisma: PrismaClient) {}

  async createMerchant(input: CreateMerchantInput) {
    // Check for duplicate code or email
    const existing = await this.prisma.merchant.findFirst({
      where: {
        OR: [{ code: input.code }, { email: input.email }],
      },
    });
    if (existing) {
      throw new ConflictError(
        "Merchant with this code or email already exists",
      );
    }

    const merchant = await this.prisma.$transaction(async (tx) => {
      // Create merchant
      const m = await tx.merchant.create({
        data: {
          code: input.code,
          legalName: input.legalName,
          displayName: input.displayName,
          dbaName: input.dbaName,
          email: input.email,
          phone: input.phone,
          country: input.country,
          preferredLang: input.preferredLang,
          mcc: input.mcc,
          merchantCategory: input.merchantCategory,
          website: input.website,
          taxId: input.taxId,
          status: "PENDING",
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      // Auto-create KYC record
      await tx.kycRecord.create({
        data: {
          merchantId: m.id,
          status: "NOT_STARTED",
        },
      });

      // Auto-create ledger account for this merchant
      await tx.account.create({
        data: {
          code: `MERCHANT-${m.code}-USD`,
          name: `Merchant Account: ${m.code}`,
          type: "LIABILITY",
          subtype: "MERCHANT",
          currency: "USD",
        },
      });

      logger.info({ merchantId: m.id, code: m.code }, "Merchant created");
      return m;
    });

    return merchant;
  }

  async getMerchant(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        kycRecord: true,
        merchantIds: true,
        riskProfile: true,
        pricingPlan: true,
        merchantAccounts: {
          include: { wallet: true, settlementAccount: true },
        },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
        paymentLinks: { orderBy: { createdAt: "desc" }, take: 10 },
        kycDocuments: { orderBy: { createdAt: "desc" } },
        agent: true,
        _count: {
          select: {
            terminals: true,
            wallets: true,
            transactions: true,
          },
        },
      },
    });
    if (!merchant) throw new NotFoundError("Merchant", id);
    return merchant;
  }

  async getMerchantByCode(code: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { code },
      include: { kycRecord: true },
    });
    if (!merchant) throw new NotFoundError("Merchant", code);
    return merchant;
  }

  async listMerchants(filters: {
    status?: string;
    country?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.MerchantWhereInput = {};
    if (filters.status) where.status = filters.status as never;
    if (filters.country) where.country = filters.country;

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        include: {
          kycRecord: { select: { status: true } },
          _count: { select: { terminals: true, wallets: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return {
      data: merchants,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  async updateMerchant(id: string, input: UpdateMerchantInput) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundError("Merchant", id);

    const updated = await this.prisma.merchant.update({
      where: { id },
      data: {
        legalName: input.legalName,
        displayName: input.displayName,
        dbaName: input.dbaName,
        phone: input.phone,
        preferredLang: input.preferredLang,
        mcc: input.mcc,
        website: input.website,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    logger.info({ merchantId: id }, "Merchant updated");
    return updated;
  }

  async suspendMerchant(id: string, reason?: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundError("Merchant", id);

    if (merchant.status === "TERMINATED") {
      throw new ConflictError("Cannot suspend a terminated merchant");
    }

    const updated = await this.prisma.merchant.update({
      where: { id },
      data: {
        status: "SUSPENDED",
        metadata: {
          ...((merchant.metadata as object) ?? {}),
          suspensionReason: reason,
          suspendedAt: new Date().toISOString(),
        },
      },
    });

    logger.warn({ merchantId: id, reason }, "Merchant suspended");
    return updated;
  }

  async reactivateMerchant(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { kycRecord: true },
    });
    if (!merchant) throw new NotFoundError("Merchant", id);

    if (merchant.status === "TERMINATED") {
      throw new ConflictError("Cannot reactivate a terminated merchant");
    }

    if (merchant.kycRecord?.status !== "APPROVED") {
      throw new ValidationError(
        "Merchant KYC must be approved before reactivation",
      );
    }

    const updated = await this.prisma.merchant.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    logger.info({ merchantId: id }, "Merchant reactivated");
    return updated;
  }

  async setMerchantStatus(id: string, status: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { kycRecord: true },
    });
    if (!merchant) throw new NotFoundError("Merchant", id);
    if (
      ["APPROVED", "ACTIVE"].includes(status) &&
      merchant.kycRecord?.status !== "APPROVED"
    ) {
      throw new ValidationError(
        "Merchant KYC must be approved before merchant approval or activation",
      );
    }
    return this.prisma.merchant.update({
      where: { id },
      data: { status: status as never },
    });
  }

  async getMerchantStats(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundError("Merchant", id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalTransactions,
      todayTransactions,
      authorizedTransactions,
      declinedTransactions,
      totalTransfers,
      completedTransfers,
      pendingSettlements,
      walletsCount,
      terminalsCount,
      terminalsOnline,
    ] = await Promise.all([
      this.prisma.transaction.count({ where: { merchantId: id } }),
      this.prisma.transaction.count({
        where: { merchantId: id, createdAt: { gte: today } },
      }),
      this.prisma.transaction.count({
        where: { merchantId: id, status: "AUTHORIZED" },
      }),
      this.prisma.transaction.count({
        where: { merchantId: id, status: "DECLINED" },
      }),
      this.prisma.transfer.count({ where: { merchantId: id } }),
      this.prisma.transfer.count({
        where: { merchantId: id, status: "COMPLETED" },
      }),
      this.prisma.settlementBatch.count({
        where: { merchantId: id, status: { in: ["OPEN", "PROCESSING"] } },
      }),
      this.prisma.wallet.count({ where: { merchantId: id } }),
      this.prisma.terminal.count({ where: { merchantId: id } }),
      this.prisma.terminal.count({
        where: { merchantId: id, health: { status: "ONLINE" } },
      }),
    ]);

    return {
      merchantId: id,
      transactions: {
        total: totalTransactions,
        today: todayTransactions,
        authorized: authorizedTransactions,
        declined: declinedTransactions,
        authorizationRate:
          totalTransactions > 0
            ? ((authorizedTransactions / totalTransactions) * 100).toFixed(2) +
              "%"
            : "N/A",
      },
      transfers: {
        total: totalTransfers,
        completed: completedTransfers,
      },
      settlements: {
        pending: pendingSettlements,
      },
      wallets: { count: walletsCount },
      terminals: {
        total: terminalsCount,
        online: terminalsOnline,
        offline: terminalsCount - terminalsOnline,
      },
    };
  }

  async getMerchantHome(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        displayName: true,
        legalName: true,
        status: true,
        country: true,
      },
    });
    if (!merchant) throw new NotFoundError("Merchant", id);

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const successfulStatuses = ["AUTHORIZED", "CAPTURED", "SETTLED"] as const;
    const transactionSelect = {
      stan: true,
      rrn: true,
      type: true,
      status: true,
      amount: true,
      currency: true,
      createdAt: true,
      terminal: { select: { tid: true } },
    } as const;

    const [
      todayVolume,
      monthVolume,
      accounts,
      terminalRecords,
      totalTerminals,
      onlineTerminals,
      recentTransactions,
      settlementStatuses,
      recentSettlements,
    ] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["currency"],
        where: {
          merchantId: id,
          type: "AUTHORIZATION",
          createdAt: { gte: today },
          status: { in: [...successfulStatuses] },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["currency"],
        where: {
          merchantId: id,
          type: "AUTHORIZATION",
          createdAt: { gte: monthStart },
          status: { in: [...successfulStatuses] },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.account.findMany({
        where: { code: { startsWith: `MERCHANT-${merchant.code}-` } },
        select: { currency: true, balance: true, heldBalance: true },
        orderBy: { currency: "asc" },
      }),
      this.prisma.terminal.findMany({
        where: { merchantId: id },
        select: { tid: true, health: { select: { status: true } } },
        orderBy: { tid: "asc" },
        take: 8,
      }),
      this.prisma.terminal.count({ where: { merchantId: id } }),
      this.prisma.terminal.count({
        where: { merchantId: id, health: { status: "ONLINE" } },
      }),
      this.prisma.transaction.findMany({
        where: { merchantId: id },
        select: transactionSelect,
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.settlementBatch.groupBy({
        by: ["status"],
        where: { merchantId: id },
        _count: { _all: true },
      }),
      this.prisma.settlementBatch.findMany({
        where: { merchantId: id },
        select: {
          batchNumber: true,
          status: true,
          period: true,
          transactionCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const serializeVolume = (groups: typeof todayVolume) =>
      groups.map((group) => ({
        currency: group.currency,
        amount: group._sum.amount?.toString() ?? "0",
        transactions: group._count._all,
      }));

    return {
      merchant,
      period: {
        today: today.toISOString(),
        monthStart: monthStart.toISOString(),
      },
      volumes: {
        today: serializeVolume(todayVolume),
        month: serializeVolume(monthVolume),
      },
      balances: accounts.map((account) => ({
        currency: account.currency,
        balance: account.balance.toString(),
        held: account.heldBalance.toString(),
        available: new Decimal(account.balance)
          .minus(account.heldBalance)
          .toString(),
      })),
      terminals: {
        total: totalTerminals,
        online: onlineTerminals,
        items: terminalRecords.map((terminal) => ({
          tid: terminal.tid,
          status: terminal.health?.status ?? "UNKNOWN",
        })),
      },
      recentTransactions: recentTransactions.map((transaction) => ({
        reference: transaction.rrn || transaction.stan,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        terminal: transaction.terminal?.tid ?? "—",
        createdAt: transaction.createdAt,
      })),
      settlements: {
        statuses: settlementStatuses.map((group) => ({
          status: group.status,
          count: group._count._all,
        })),
        recent: recentSettlements,
      },
    };
  }

  async listMerchantIds(merchantId: string) {
    await this.requireMerchant(merchantId);
    return this.prisma.merchantMid.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createMerchantId(
    merchantId: string,
    input: { mid: string; label?: string },
  ) {
    await this.requireMerchant(merchantId);
    const existing = await this.prisma.merchantMid.findUnique({
      where: { mid: input.mid },
    });
    if (existing) throw new ConflictError(`MID already exists: ${input.mid}`);
    return this.prisma.merchantMid.create({
      data: { merchantId, mid: input.mid, label: input.label },
    });
  }

  async listMerchantTerminals(merchantId: string) {
    await this.requireMerchant(merchantId);
    return this.prisma.terminal.findMany({
      where: { merchantId },
      include: { health: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async assignTerminal(merchantId: string, terminalId: string, mid: string) {
    await this.requireMerchant(merchantId);
    const merchantMid = await this.prisma.merchantMid.findFirst({
      where: { merchantId, mid, status: "ACTIVE" },
    });
    if (!merchantMid) throw new NotFoundError("Active merchant MID", mid);
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
    });
    if (!terminal) throw new NotFoundError("Terminal", terminalId);
    return this.prisma.terminal.update({
      where: { id: terminalId },
      data: { merchantId, mid },
      include: { health: true },
    });
  }

  async addKycDocument(
    merchantId: string,
    input: {
      documentType: string;
      documentReference: string;
    },
  ) {
    await this.requireMerchant(merchantId);
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.merchantKycDocument.create({
        data: { merchantId, ...input },
      });
      const kyc = await tx.kycRecord.findUnique({ where: { merchantId } });
      if (!kyc) throw new NotFoundError("KYC record", merchantId);
      if (kyc.status !== "APPROVED") {
        await tx.kycRecord.update({
          where: { merchantId },
          data: { status: "UNDER_REVIEW", submittedAt: new Date() },
        });
        await tx.merchant.updateMany({
          where: { id: merchantId, status: "PENDING" },
          data: { status: "UNDER_REVIEW" },
        });
      }
      return document;
    });
  }

  async listKycDocuments(merchantId: string) {
    await this.requireMerchant(merchantId);
    return this.prisma.merchantKycDocument.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async reviewKycDocument(
    documentId: string,
    input: {
      verificationStatus: string;
      reviewedBy?: string;
    },
  ) {
    const document = await this.prisma.merchantKycDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundError("Merchant KYC document", documentId);
    return this.prisma.merchantKycDocument.update({
      where: { id: documentId },
      data: {
        verificationStatus: input.verificationStatus,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.verificationStatus === "PENDING" ? null : new Date(),
      },
    });
  }

  async setRiskProfile(
    merchantId: string,
    input: {
      dailyLimit?: string;
      monthlyLimit?: string;
      chargebackLimit?: string;
      riskScore: number;
    },
  ) {
    await this.requireMerchant(merchantId);
    if (
      !Number.isInteger(input.riskScore) ||
      input.riskScore < 0 ||
      input.riskScore > 100
    ) {
      throw new ValidationError(
        "riskScore must be an integer between 0 and 100",
      );
    }
    for (const [key, value] of Object.entries(input)) {
      if (key === "riskScore" || typeof value !== "string") continue;
      money(value, key);
    }
    const riskLevel =
      input.riskScore >= 75
        ? "HIGH"
        : input.riskScore >= 40
          ? "MEDIUM"
          : "STANDARD";
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.merchantRiskProfile.upsert({
        where: { merchantId },
        create: { merchantId, ...input },
        update: input,
      });
      await tx.merchant.update({
        where: { id: merchantId },
        data: { riskLevel },
      });
      return profile;
    });
  }

  async createPricingPlan(input: {
    planName: string;
    transactionFee: string;
    settlementFee: string;
    payoutFee: string;
    currency: string;
  }) {
    for (const key of [
      "transactionFee",
      "settlementFee",
      "payoutFee",
    ] as const) {
      const fee = money(input[key], key, true, 4, 6);
      if (fee.gt(100))
        throw new ValidationError(`${key} cannot exceed 100 percent`);
    }
    return this.prisma.pricingPlan.create({ data: input });
  }

  async assignPricingPlan(merchantId: string, pricingPlanId: string | null) {
    await this.requireMerchant(merchantId);
    if (pricingPlanId) {
      const plan = await this.prisma.pricingPlan.findUnique({
        where: { id: pricingPlanId },
      });
      if (!plan || !plan.active)
        throw new NotFoundError("Active pricing plan", pricingPlanId);
    }
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { pricingPlanId },
      include: { pricingPlan: true },
    });
  }

  async listPricingPlans() {
    return this.prisma.pricingPlan.findMany({
      where: { active: true },
      orderBy: { planName: "asc" },
    });
  }

  async mapMerchantWallet(
    merchantId: string,
    input: {
      walletId: string;
      settlementAccountId?: string;
    },
  ) {
    await this.requireMerchant(merchantId);
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: input.walletId },
    });
    if (
      !wallet ||
      wallet.merchantId !== merchantId ||
      wallet.type !== "MERCHANT"
    ) {
      throw new ValidationError(
        "Wallet must be a MERCHANT wallet owned by this merchant",
      );
    }
    if (input.settlementAccountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: input.settlementAccountId },
      });
      if (!account)
        throw new NotFoundError(
          "Settlement account",
          input.settlementAccountId,
        );
      if (account.currency !== wallet.currency) {
        throw new ValidationError(
          "Settlement account currency must match the merchant wallet",
        );
      }
    }
    return this.prisma.merchantAccount.upsert({
      where: { merchantId_walletId: { merchantId, walletId: input.walletId } },
      create: { merchantId, ...input },
      update: { settlementAccountId: input.settlementAccountId },
      include: { wallet: true, settlementAccount: true },
    });
  }

  async createInvoice(
    merchantId: string,
    input: {
      amount: string;
      currency: string;
      description?: string;
      dueAt?: Date;
    },
  ) {
    await this.requireActiveMerchant(merchantId);
    const amount = money(input.amount, "Invoice amount", false);
    if (
      input.dueAt &&
      (!Number.isFinite(input.dueAt.getTime()) || input.dueAt <= new Date())
    ) {
      throw new ValidationError("Invoice due date must be a future date");
    }
    return this.prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
        merchantId,
        amount: amount.toString(),
        currency: input.currency,
        description: input.description,
        dueAt: input.dueAt,
      },
    });
  }

  async listInvoices(merchantId: string, page: number, pageSize: number) {
    await this.requireMerchant(merchantId);
    const where = { merchantId };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async createPaymentLink(
    merchantId: string,
    input: {
      amount: string;
      currency: string;
      description?: string;
      expiresAt?: Date;
    },
  ) {
    await this.requireActiveMerchant(merchantId);
    const amount = money(input.amount, "Payment link amount", false);
    if (
      input.expiresAt &&
      (!Number.isFinite(input.expiresAt.getTime()) ||
        input.expiresAt <= new Date())
    ) {
      throw new ValidationError("Payment link expiry must be a future date");
    }
    return this.prisma.paymentLink.create({
      data: {
        merchantId,
        reference: `PL-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`,
        amount: amount.toString(),
        currency: input.currency,
        description: input.description,
        expiresAt: input.expiresAt,
      },
    });
  }

  async listPaymentLinks(merchantId: string, page: number, pageSize: number) {
    await this.requireMerchant(merchantId);
    const where = { merchantId };
    const [data, total] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.paymentLink.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async listMerchantTransactions(
    merchantId: string,
    page: number,
    pageSize: number,
  ) {
    await this.requireMerchant(merchantId);
    const where = { merchantId };
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        select: {
          id: true,
          stan: true,
          rrn: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          responseCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async listMerchantSettlements(
    merchantId: string,
    page: number,
    pageSize: number,
  ) {
    await this.requireMerchant(merchantId);
    const where = { merchantId };
    const [data, total] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlementBatch.count({ where }),
    ]);
    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getMerchantBalance(merchantId: string, currency: string) {
    const merchant = await this.requireMerchant(merchantId);
    const account = await this.prisma.account.findUnique({
      where: { code: `MERCHANT-${merchant.code}-${currency}` },
    });
    if (!account)
      throw new NotFoundError(
        "Merchant settlement account",
        `${merchant.code}-${currency}`,
      );
    return {
      merchantId,
      currency,
      balance: account.balance.toString(),
      heldBalance: account.heldBalance.toString(),
      availableBalance: new Decimal(account.balance)
        .minus(account.heldBalance)
        .toString(),
    };
  }

  async listMerchantStatement(
    merchantId: string,
    currency: string,
    page: number,
    pageSize: number,
  ) {
    const merchant = await this.requireMerchant(merchantId);
    const account = await this.prisma.account.findUnique({
      where: { code: `MERCHANT-${merchant.code}-${currency}` },
    });
    if (!account)
      throw new NotFoundError(
        "Merchant settlement account",
        `${merchant.code}-${currency}`,
      );
    const where = { accountId: account.id };
    const [lines, total] = await Promise.all([
      this.prisma.journalLine.findMany({
        where,
        include: { entry: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.journalLine.count({ where }),
    ]);
    return {
      data: lines.map((line) => ({
        reference: line.entry.reference,
        entryType: line.entry.entryType,
        description: line.entry.description,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
        currency: line.currency,
        createdAt: line.createdAt,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async createAgent(input: {
    code: string;
    name: string;
    commissionRate: string;
    parentAgentId?: string;
  }) {
    const rate = money(input.commissionRate, "Commission rate", true, 4, 6);
    if (rate.gt(100))
      throw new ValidationError("Commission rate cannot exceed 100");
    if (input.parentAgentId) {
      const parent = await this.prisma.agent.findUnique({
        where: { id: input.parentAgentId },
      });
      if (!parent) throw new NotFoundError("Parent agent", input.parentAgentId);
    }
    return this.prisma.agent.create({
      data: { ...input, commissionRate: rate.toString() },
    });
  }

  async listAgents() {
    return this.prisma.agent.findMany({
      include: {
        parentAgent: { select: { id: true, code: true, name: true } },
        _count: { select: { childAgents: true, merchants: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async assignAgent(merchantId: string, agentId: string | null) {
    await this.requireMerchant(merchantId);
    if (agentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
      });
      if (!agent) throw new NotFoundError("Agent", agentId);
    }
    return this.prisma.merchant.update({
      where: { id: merchantId },
      data: { agentId },
    });
  }

  async getMerchantDashboard() {
    const [total, pending, active, blocked, transactionsToday, recent] =
      await Promise.all([
        this.prisma.merchant.count(),
        this.prisma.merchant.count({
          where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
        }),
        this.prisma.merchant.count({
          where: { status: { in: ["ACTIVE", "APPROVED"] } },
        }),
        this.prisma.merchant.count({
          where: { status: { in: ["BLOCKED", "SUSPENDED", "TERMINATED"] } },
        }),
        this.prisma.transaction.count({
          where: {
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        this.prisma.merchant.findMany({
          include: {
            kycRecord: { select: { status: true } },
            _count: { select: { terminals: true, transactions: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);
    return {
      summary: { total, pending, active, blocked, transactionsToday },
      merchants: recent,
    };
  }

  private async requireMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new NotFoundError("Merchant", merchantId);
    return merchant;
  }

  private async requireActiveMerchant(merchantId: string) {
    const merchant = await this.requireMerchant(merchantId);
    if (!["ACTIVE", "APPROVED"].includes(merchant.status)) {
      throw new ValidationError(
        `Merchant is not approved for payment operations (${merchant.status})`,
      );
    }
    return merchant;
  }
}
