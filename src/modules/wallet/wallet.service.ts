import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { Decimal } from "../../core/decimal.js";
import {
  AccountNotActiveError,
  ConflictError,
  LedgerError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { LedgerService } from "../ledger/ledger.service.js";
import type { CreateWalletInput, UpdateWalletInput, WalletBalance } from "./types.js";

function parseMoney(value: string | number, label: string, scale = 4, allowZero = false): Decimal {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new ValidationError(`${label} must be a valid number`);
  }
  if (
    !amount.isFinite() ||
    (allowZero ? amount.lt(0) : amount.lte(0)) ||
    amount.decimalPlaces() > scale ||
    amount.abs().gte(new Decimal(10).pow(20 - scale))
  ) {
    throw new ValidationError(
      `${label} must be ${allowZero ? "non-negative" : "positive"} and fit a decimal(20, ${scale}) amount`,
    );
  }
  return amount;
}

export interface WalletTransferInput {
  type: "WALLET";
  amount: string;
  feeAmount: string;
  currency: string;
  sourceType: "WALLET";
  sourceId: string;
  destType: "WALLET";
  destId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

type WalletTransferExecutor = (input: WalletTransferInput) => Promise<unknown>;

/**
 * Wallet Service
 *
 * Digital wallets sit on top of the ledger. Each wallet has a linked
 * ledger account — the wallet's balance is the ledger account's balance.
 *
 * Wallet balances and held funds are derived from their linked ledger accounts.
 *
 * All balance operations delegate to the LedgerService for
 * double-entry consistency.
 */
export class WalletService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
  ) {}

  private transferExecutor?: WalletTransferExecutor;

  setTransferExecutor(executor: WalletTransferExecutor): void {
    this.transferExecutor = executor;
  }

  async createWallet(input: CreateWalletInput) {
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new ValidationError("Wallet currency must be a three-letter uppercase code");
    }
    const initialBalance = input.initialBalance === undefined
      ? undefined
      : parseMoney(input.initialBalance, "Initial balance", 4, true);
    if (input.type === "MERCHANT" && !input.merchantId) {
      throw new ValidationError("merchantId is required for a merchant wallet");
    }

    // Check for existing wallet
    const existing = await this.prisma.wallet.findUnique({
      where: { walletAddress: input.walletAddress },
    });
    if (existing) {
      throw new ConflictError(`Wallet already exists: ${input.walletAddress}`);
    }

    // If merchant wallet, verify merchant exists
    if (input.merchantId) {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: input.merchantId },
      });
      if (!merchant) {
        throw new NotFoundError("Merchant", input.merchantId);
      }
    }

    // Create a linked ledger account for this wallet
    const accountCode = `WALLET-${input.walletAddress}-${input.currency}`;
    const account = await this.ledgerService.createAccount({
      code: accountCode,
      name: `Wallet: ${input.walletAddress}`,
      type: "LIABILITY",
      subtype: "WALLET",
      currency: input.currency,
      metadata: { walletAddress: input.walletAddress, walletType: input.type },
    });

    // Create the wallet record
    const wallet = await this.prisma.wallet.create({
      data: {
        walletAddress: input.walletAddress,
        label: input.label,
        type: input.type,
        merchantId: input.merchantId,
        accountId: account.id,
        currency: input.currency,
        preferredLang: input.preferredLang,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { account: true },
    });

    // If initial balance provided, post a funding entry
    if (initialBalance?.gt(0)) {
      await this.fundWallet(wallet.walletAddress, initialBalance.toString(), "Initial funding");
    }

    logger.info(
      { walletAddress: wallet.walletAddress, type: wallet.type, currency: wallet.currency },
      "Wallet created",
    );

    return wallet;
  }

  async getWallet(walletAddress: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletAddress },
      include: { account: true, merchant: true },
    });

    if (!wallet) {
      throw new NotFoundError("Wallet", walletAddress);
    }

    return wallet;
  }

  async getBalance(walletAddress: string): Promise<WalletBalance> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletAddress },
      include: { account: true },
    });

    if (!wallet) {
      throw new NotFoundError("Wallet", walletAddress);
    }

    const balance = new Decimal(wallet.account.balance);
    const held = new Decimal(wallet.account.heldBalance);
    const available = balance.minus(held);

    return {
      walletAddress: wallet.walletAddress,
      type: wallet.type,
      currency: wallet.currency,
      balance: balance.toString(),
      heldBalance: held.toString(),
      availableBalance: available.toString(),
      status: wallet.status,
    };
  }

  async updateWallet(walletAddress: string, input: UpdateWalletInput) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletAddress },
    });

    if (!wallet) {
      throw new NotFoundError("Wallet", walletAddress);
    }

    // If changing status to FROZEN, also freeze the ledger account
    if (input.status === "FROZEN" && wallet.status === "ACTIVE") {
      await this.prisma.account.update({
        where: { id: wallet.accountId },
        data: { status: "FROZEN" },
      });
    }

    // If changing status to ACTIVE from FROZEN, unfreeze the ledger account
    if (input.status === "ACTIVE" && wallet.status === "FROZEN") {
      await this.prisma.account.update({
        where: { id: wallet.accountId },
        data: { status: "ACTIVE" },
      });
    }

    // CLOSED wallets also close the ledger account
    if (input.status === "CLOSED" && wallet.status !== "CLOSED") {
      const account = await this.prisma.account.findUnique({
        where: { id: wallet.accountId },
      });
      if (!account) throw new NotFoundError("Ledger account", wallet.accountId);
      const balance = new Decimal(account.balance);
      const heldBalance = new Decimal(account.heldBalance);
      if (!balance.isZero() || !heldBalance.isZero()) {
        throw new ConflictError(
          `Cannot close wallet with a non-zero balance or active holds: ${account.balance} ${wallet.currency}`,
        );
      }
      await this.prisma.account.update({
        where: { id: wallet.accountId },
        data: { status: "CLOSED" },
      });
    }

    const updated = await this.prisma.wallet.update({
      where: { walletAddress },
      data: {
        label: input.label,
        preferredLang: input.preferredLang,
        status: input.status,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { account: true },
    });

    logger.info({ walletAddress, status: updated.status }, "Wallet updated");
    return updated;
  }

  async listWallets(filters: {
    type?: string;
    status?: string;
    merchantId?: string;
    currency?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.WalletWhereInput = {};
    if (filters.type) where.type = filters.type as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.currency) where.currency = filters.currency;

    const [wallets, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        include: { account: true, merchant: true },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      data: wallets,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  /**
   * Fund a wallet from a system funding account.
   * Posts a journal entry: credit the wallet account, debit the funding account.
   */
  async fundWallet(walletAddress: string, amount: string, description: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletAddress },
      include: { account: true },
    });

    if (!wallet) {
      throw new NotFoundError("Wallet", walletAddress);
    }

    if (wallet.status !== "ACTIVE") {
      throw new AccountNotActiveError(walletAddress, wallet.status);
    }

    const ref = `FUND-${walletAddress}-${Date.now()}`;

    const entry = await this.ledgerService.postEntry({
      reference: ref,
      entryType: "TRANSFER",
      description,
      source: "WALLET",
      lines: [
        {
          accountCode: "SYSTEM-FUNDING-" + wallet.currency,
          debit: amount,
          credit: "0",
        },
        {
          accountCode: wallet.account.code,
          debit: "0",
          credit: amount,
        },
      ],
    });

    logger.info({ walletAddress, amount, reference: ref }, "Wallet funded");
    return entry;
  }

  /**
   * Verify that a wallet has sufficient available balance.
   * Used by the transfer service before initiating a transfer.
   */
  async checkSufficientFunds(walletAddress: string, amount: string): Promise<boolean> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletAddress },
      include: { account: true },
    });

    if (!wallet) return false;
    if (wallet.status !== "ACTIVE") return false;

    const available = new Decimal(wallet.account.balance).minus(wallet.account.heldBalance);
    return available.gte(new Decimal(amount));
  }

  async transfer(input: {
    sourceAddress: string;
    destinationAddress: string;
    amount: string;
    currency: string;
    description?: string;
  }) {
    if (!this.transferExecutor) throw new LedgerError("Wallet transfer service is unavailable");
    const amount = parseMoney(input.amount, "Transfer amount");
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new ValidationError("Transfer currency must be a three-letter uppercase code");
    }
    if (input.sourceAddress === input.destinationAddress) {
      throw new ConflictError("Source and destination wallets must differ");
    }
    const [source, destination] = await Promise.all([
      this.getWallet(input.sourceAddress),
      this.getWallet(input.destinationAddress),
    ]);
    if (source.currency !== input.currency || destination.currency !== input.currency) {
      throw new LedgerError("Wallet and transfer currencies must match");
    }
    if (source.status !== "ACTIVE" || destination.status !== "ACTIVE") {
      throw new AccountNotActiveError(
        source.status !== "ACTIVE" ? source.walletAddress : destination.walletAddress,
        source.status !== "ACTIVE" ? source.status : destination.status,
      );
    }
    const rules = await this.prisma.feeRule.findMany({
      where: { transactionType: "WALLET", currency: input.currency, active: true },
      take: 2,
    });
    if (rules.length > 1) {
      throw new ConflictError(`Multiple active wallet fee rules exist for ${input.currency}`);
    }
    const rule = rules[0];
    const feeAmount = rule
      ? rule.feeType === "PERCENTAGE"
        ? amount.mul(rule.value).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toString()
        : rule.value.toString()
      : "0";
    if (new Decimal(feeAmount).gt(amount)) {
      throw new ValidationError("Wallet transfer amount must cover the configured fee");
    }
    return this.transferExecutor({
      type: "WALLET",
      amount: input.amount,
      feeAmount,
      currency: input.currency,
      sourceType: "WALLET",
      sourceId: input.sourceAddress,
      destType: "WALLET",
      destId: input.destinationAddress,
      description: input.description,
    });
  }

  async addBeneficiary(walletAddress: string, input: {
    beneficiaryName: string;
    beneficiaryIdentifier: string;
  }) {
    const wallet = await this.getWallet(walletAddress);
    return this.prisma.beneficiary.create({
      data: { walletId: wallet.id, ...input },
    });
  }

  async listBeneficiaries(walletAddress: string) {
    const wallet = await this.getWallet(walletAddress);
    return this.prisma.beneficiary.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async createVirtualAccount(walletAddress: string, currency: string) {
    const wallet = await this.getWallet(walletAddress);
    const accountNumber = `VA-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
    return this.prisma.virtualAccount.create({
      data: { walletId: wallet.id, currency: currency.toUpperCase(), accountNumber },
    });
  }

  async listVirtualAccounts(walletAddress: string) {
    const wallet = await this.getWallet(walletAddress);
    return this.prisma.virtualAccount.findMany({
      where: { walletId: wallet.id, active: true },
      orderBy: { currency: "asc" },
    });
  }

  async setLimits(walletAddress: string, limits: {
    dailyLimit?: string;
    monthlyLimit?: string;
    yearlyLimit?: string;
  }) {
    for (const [name, value] of Object.entries(limits)) {
      if (value === undefined) continue;
      parseMoney(value, name, 2, true);
    }
    const wallet = await this.getWallet(walletAddress);
    return this.prisma.walletLimit.upsert({
      where: { walletId: wallet.id },
      create: {
        walletId: wallet.id,
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
        yearlyLimit: limits.yearlyLimit,
      },
      update: {
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
        yearlyLimit: limits.yearlyLimit,
      },
    });
  }

  async getLimits(walletAddress: string) {
    const wallet = await this.getWallet(walletAddress);
    return this.prisma.walletLimit.findUnique({ where: { walletId: wallet.id } });
  }

  async getStatement(walletAddress: string, page = 1, pageSize = 20) {
    const wallet = await this.getWallet(walletAddress);
    const where = { accountId: wallet.accountId };
    const [lines, total] = await Promise.all([
      this.prisma.journalLine.findMany({
        where,
        include: { entry: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  async createHold(walletAddress: string, input: {
    amount: string;
    reference: string;
    reason: string;
    releaseDate?: Date;
  }) {
    parseMoney(input.amount, "Hold amount");
    if (input.releaseDate && !Number.isFinite(input.releaseDate.getTime())) {
      throw new ValidationError("releaseDate must be a valid date");
    }
    const wallet = await this.getWallet(walletAddress);
    const hold = await this.prisma.walletHold.create({
      data: { walletId: wallet.id, ...input },
    });
    try {
      await this.ledgerService.holdFunds({
        accountCode: wallet.account.code,
        amount: input.amount,
        reference: input.reference,
      });
      return hold;
    } catch (error) {
      await this.prisma.walletHold.delete({ where: { id: hold.id } });
      throw error;
    }
  }

  async releaseHold(reference: string) {
    const hold = await this.prisma.walletHold.findUnique({
      where: { reference },
      include: { wallet: { include: { account: true } } },
    });
    if (!hold) throw new NotFoundError("Wallet hold", reference);
    if (hold.status === "RELEASED") return hold;
    if (hold.status !== "ACTIVE") {
      throw new ConflictError(`Wallet hold ${reference} is ${hold.status}`);
    }

    const claimed = await this.prisma.walletHold.updateMany({
      where: { id: hold.id, status: "ACTIVE" },
      data: { status: "RELEASING" },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.walletHold.findUnique({ where: { id: hold.id } });
      if (current?.status === "RELEASED") return current;
      throw new ConflictError(`Wallet hold ${reference} is already being processed`);
    }

    try {
      await this.ledgerService.releaseFunds(
        hold.wallet.account.code,
        hold.amount.toString(),
        reference,
      );
      return await this.prisma.walletHold.update({
        where: { id: hold.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    } catch (error) {
      logger.error({ err: error, reference }, "Wallet hold release requires reconciliation");
      throw error;
    }
  }

  async createEscrow(input: {
    reference: string;
    buyerAddress: string;
    sellerAddress: string;
    amount: string;
    currency: string;
  }) {
    const amount = parseMoney(input.amount, "Escrow amount");
    if (input.buyerAddress === input.sellerAddress) throw new ConflictError("Buyer and seller wallets must differ");
    const currency = input.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError("Escrow currency must be a three-letter code");
    }
    const [buyer, seller] = await Promise.all([
      this.getWallet(input.buyerAddress),
      this.getWallet(input.sellerAddress),
    ]);
    if (buyer.currency !== currency || seller.currency !== currency) {
      throw new ConflictError("Escrow, buyer, and seller currencies must match");
    }
    const escrowAddress = `ESCROW-${input.reference}`;
    const escrowWallet = await this.createWallet({
      walletAddress: escrowAddress,
      type: "ESCROW",
      currency,
      preferredLang: "en",
    });
    const escrow = await this.prisma.escrowAccount.create({
      data: {
        reference: input.reference,
        escrowWalletId: escrowWallet.id,
        buyerWalletId: buyer.id,
        sellerWalletId: seller.id,
        amount: amount.toString(),
        currency,
      },
    });
    try {
      await this.transfer({
        sourceAddress: buyer.walletAddress,
        destinationAddress: escrowAddress,
        amount: amount.toString(),
        currency,
        description: `Fund escrow ${input.reference}`,
      });
      return this.prisma.escrowAccount.update({
        where: { id: escrow.id },
        data: { status: "FUNDED", fundedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.escrowAccount.update({
        where: { id: escrow.id },
        data: { status: "FUNDING_FAILED" },
      });
      throw error;
    }
  }

  async closeEscrow(reference: string, action: "RELEASED" | "REFUNDED") {
    const escrow = await this.prisma.escrowAccount.findUnique({
      where: { reference },
      include: { escrowWallet: true, buyerWallet: true, sellerWallet: true },
    });
    if (!escrow) throw new NotFoundError("Escrow", reference);
    if (escrow.status === action) return escrow;
    if (escrow.status !== "FUNDED") throw new ConflictError(`Escrow is ${escrow.status}, not FUNDED`);

    const processingStatus = action === "RELEASED" ? "RELEASING" : "REFUNDING";
    const claimed = await this.prisma.escrowAccount.updateMany({
      where: { id: escrow.id, status: "FUNDED" },
      data: { status: processingStatus },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.escrowAccount.findUnique({ where: { id: escrow.id } });
      if (current?.status === action) return current;
      throw new ConflictError(`Escrow ${reference} is already being processed`);
    }

    const destination = action === "RELEASED" ? escrow.sellerWallet : escrow.buyerWallet;
    try {
      await this.transfer({
        sourceAddress: escrow.escrowWallet.walletAddress,
        destinationAddress: destination.walletAddress,
        amount: escrow.amount.toString(),
        currency: escrow.currency,
        description: `${action === "RELEASED" ? "Release" : "Refund"} escrow ${reference}`,
      });
      return await this.prisma.escrowAccount.update({
        where: { id: escrow.id },
        data: { status: action, closedAt: new Date() },
      });
    } catch (error) {
      logger.error({ err: error, reference, action }, "Escrow close requires reconciliation");
      throw error;
    }
  }

  async listHolds() {
    return this.prisma.walletHold.findMany({
      include: { wallet: { select: { walletAddress: true, currency: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async listEscrows() {
    return this.prisma.escrowAccount.findMany({
      include: {
        buyerWallet: { select: { walletAddress: true } },
        sellerWallet: { select: { walletAddress: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async assignMerchantWallet(input: { merchantId: string; walletAddress: string; settlementFrequency: string }) {
    const allowedFrequencies = ["INSTANT", "DAILY", "WEEKLY", "MONTHLY"];
    if (!allowedFrequencies.includes(input.settlementFrequency)) {
      throw new LedgerError("Invalid settlement frequency");
    }
    const [merchant, wallet] = await Promise.all([
      this.prisma.merchant.findUnique({ where: { id: input.merchantId } }),
      this.getWallet(input.walletAddress),
    ]);
    if (!merchant) throw new NotFoundError("Merchant", input.merchantId);
    if (wallet.type !== "MERCHANT" || wallet.merchantId !== input.merchantId) {
      throw new ConflictError("Wallet must be a MERCHANT wallet assigned to this merchant");
    }
    return this.prisma.merchantWallet.upsert({
      where: { walletId: wallet.id },
      create: { merchantId: input.merchantId, walletId: wallet.id, settlementFrequency: input.settlementFrequency },
      update: { merchantId: input.merchantId, settlementFrequency: input.settlementFrequency },
    });
  }

  async assignTreasuryWallet(walletAddress: string, purpose: string) {
    const wallet = await this.getWallet(walletAddress);
    if (wallet.type !== "TREASURY") throw new ConflictError("Wallet must have TREASURY type");
    return this.prisma.treasuryWallet.upsert({
      where: { walletId: wallet.id },
      create: { walletId: wallet.id, purpose },
      update: { purpose },
    });
  }

  async listFeeRules() {
    return this.prisma.feeRule.findMany({ orderBy: [{ transactionType: "asc" }, { currency: "asc" }] });
  }

  async createFeeRule(input: { transactionType: string; feeType: string; value: string; currency: string }) {
    const amount = parseMoney(input.value, "Fee value", 4, true);
    if (!["PERCENTAGE", "FIXED"].includes(input.feeType)) throw new LedgerError("feeType must be PERCENTAGE or FIXED");
    if (input.feeType === "PERCENTAGE" && amount.gt(100)) throw new LedgerError("Percentage fee cannot exceed 100");
    if (!/^[A-Za-z]{3}$/.test(input.currency)) {
      throw new ValidationError("Fee currency must be a three-letter code");
    }
    const currency = input.currency.toUpperCase();
    const existing = await this.prisma.feeRule.findFirst({
      where: {
        transactionType: input.transactionType,
        currency,
        active: true,
      },
    });
    if (existing) {
      throw new ConflictError(`An active fee rule already exists for ${input.transactionType} in ${currency}`);
    }
    return this.prisma.feeRule.create({
      data: {
        transactionType: input.transactionType,
        feeType: input.feeType,
        value: amount.toString(),
        currency,
      },
    });
  }
}
