import { type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { logger } from "../../core/logger.js";
import { generateStan, generateReference } from "../../shared/utils/crypto.js";
import { RoutingService } from "../routing/routing.service.js";
import { FraudService } from "../fraud/fraud.service.js";
import { NotFoundError, ValidationError, AppError } from "../../core/errors.js";

/**
 * Authorization Service — Core Switch Transaction Processing
 *
 * Implements the full authorization flow:
 *   1. Validate terminal + merchant
 *   2. Fraud check (velocity, blacklist, AML)
 *   3. Route selection (BIN / country / merchant rules)
 *   4. Record the authorization for later capture and settlement
 *   5. Return approval or decline with response code
 *
 * Response codes follow ISO 8583 standard:
 *   00 - Approved
 *   05 - Do not honor
 *   51 - Insufficient funds
 *   54 - Expired card
 *   57 - Transaction not permitted
 *   91 - Issuer unavailable
 *   96 - System error
 */
export class AuthorizationService {
  constructor(
    private prisma: PrismaClient,
    private routingService: RoutingService,
    private fraudService: FraudService,
  ) {}

  /**
   * Authorize a transaction.
   *
   * @param input Transaction authorization request
   * @returns Authorization response with approval code or decline reason
   */
  async authorize(input: {
    tid: string; // Terminal ID
    mid?: string; // Merchant ID (external)
    amount: string;
    currency: string;
    cardNumber?: string;
    cardBin?: string;
    cardType?: string;
    countryCode?: string;
    processingCode?: string; // ISO 8583 field 3
    posEntryMode?: string;
    isoFields?: Record<string, string>;
    ipAddress?: string;
  }): Promise<{
    approved: boolean;
    responseCode: string;
    responseMessage: string;
    approvalCode?: string;
    stan: string;
    transactionId: string;
    routeId?: string;
  }> {
    const stan = generateStan();
    const startTime = Date.now();
    const currency = input.currency.toUpperCase();
    let amount: Decimal;
    try {
      amount = new Decimal(input.amount);
    } catch {
      throw new ValidationError("Transaction amount must be a valid number");
    }
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 4 ||
        amount.gte(new Decimal(10).pow(16))) {
      throw new ValidationError("Transaction amount must be positive with at most four decimal places");
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError("Transaction currency must be a three-letter code");
    }

    logger.info({ stan, tid: input.tid, amount: input.amount }, "Authorization request received");

    // ── 1. Validate Terminal ──────────────────────
    const terminal = await this.prisma.terminal.findUnique({
      where: { tid: input.tid },
      include: { merchant: { include: { pricingPlan: true } } },
    });

    if (!terminal) {
      return this.decline("57", "Terminal not registered", stan, input.tid);
    }

    if (terminal.status !== "ACTIVE") {
      return this.decline("57", "Terminal not active", stan, terminal.id);
    }

    // Update terminal last seen
    await this.prisma.terminal.update({
      where: { id: terminal.id },
      data: { lastSeenAt: new Date() },
    });

    const merchantId = terminal.merchantId;
    const merchant = terminal.merchant;

    if (merchant.status !== "ACTIVE") {
      return this.decline("57", "Merchant suspended", stan, terminal.id);
    }

    // ── 2. Fraud Check ────────────────────────────
    const fraudResult = await this.fraudService.evaluate({
      merchantId,
      cardNumber: input.cardNumber,
      ipAddress: input.ipAddress,
      amount: input.amount,
      currency,
    });

    if (fraudResult.verdict === "BLOCK") {
      logger.warn({ stan, verdict: "BLOCK", reason: fraudResult.reason, triggeredRules: fraudResult.triggeredRules }, "Transaction blocked by fraud engine");
      return this.decline("05", `Declined: ${fraudResult.reason ?? "fraud rules"}`, stan, terminal.id, merchantId);
    }

    // REVIEW doesn't block — it proceeds but flags for manual review
    if (fraudResult.verdict === "REVIEW") {
      logger.warn({ stan, riskScore: fraudResult.riskScore }, "Transaction flagged for review");
    }

    // ── 3. Route Selection ────────────────────────
    const route = await this.routingService.findRoute({
      merchantId,
      bin: input.cardBin,
      countryCode: input.countryCode ?? terminal.country,
      currency,
      cardType: input.cardType,
    });

    // ── 4. Create Transaction Record ─────────────
    const approvalCode = generateReference("AUTH").slice(0, 6).toUpperCase();
    const pricingPlan = merchant.pricingPlan;
    const transactionFeeRatePercent = pricingPlan?.active && pricingPlan.currency === currency
      ? pricingPlan.transactionFee.toString()
      : "0";

    const transaction = await this.prisma.transaction.create({
      data: {
        stan,
        merchantId,
        terminalId: terminal.id,
        type: "AUTHORIZATION",
        status: "AUTHORIZED",
        amount: amount.toNumber(),
        currency,
        cardNumber: input.cardNumber ? this.maskCard(input.cardNumber) : undefined,
        cardBin: input.cardBin,
        cardType: input.cardType,
        approvalCode,
        responseCode: "00",
        responseMessage: "Approved",
        mti: "0110",
        isoFields: (input.isoFields ?? {}) as object,
        routeId: route?.id,
        processedAt: new Date(),
        metadata: {
          stan,
          riskScore: fraudResult.riskScore,
          riskLevel: fraudResult.riskLevel,
          reviewFlagged: fraudResult.verdict === "REVIEW",
          transactionFeeRatePercent,
          durationMs: Date.now() - startTime,
        },
      },
    });

    logger.info(
      { stan, transactionId: transaction.id, approvalCode, durationMs: Date.now() - startTime },
      "Transaction authorized",
    );

    return {
      approved: true,
      responseCode: "00",
      responseMessage: "Approved",
      approvalCode,
      stan,
      transactionId: transaction.id,
      routeId: route?.id,
    };
  }

  /**
   * Process a reversal for an existing transaction.
   */
  async reverse(input: {
    originalStan: string;
    tid: string;
    amount: string;
    reason?: string;
  }): Promise<{
    accepted: boolean;
    responseCode: string;
    responseMessage: string;
    stan: string;
    transactionId?: string;
  }> {
    const stan = generateStan();

    const original = await this.prisma.transaction.findUnique({
      where: { stan: input.originalStan },
    });

    if (!original) {
      return { accepted: false, responseCode: "25", responseMessage: "Original transaction not found", stan };
    }

    if (original.status === "REVERSED") {
      return { accepted: false, responseCode: "94", responseMessage: "Transaction already reversed", stan };
    }

    if (original.status === "SETTLED") {
      return { accepted: false, responseCode: "57", responseMessage: "Settled transactions must be handled through the chargeback workflow", stan };
    }
    if (original.status !== "AUTHORIZED" && original.status !== "CAPTURED") {
      return { accepted: false, responseCode: "57", responseMessage: `Cannot reverse transaction with status ${original.status}`, stan };
    }

    const originalMetadata = original.metadata && typeof original.metadata === "object" && !Array.isArray(original.metadata)
      ? original.metadata as Record<string, unknown>
      : {};
    const effectiveAmount = original.status === "CAPTURED"
      ? new Decimal(String(originalMetadata.captureAmount ?? original.amount))
      : new Decimal(original.amount);
    let reversalAmount: Decimal;
    try {
      reversalAmount = new Decimal(input.amount);
    } catch {
      throw new ValidationError("Reversal amount must be a valid number");
    }
    if (!reversalAmount.isFinite() || reversalAmount.lte(0) || reversalAmount.decimalPlaces() > 4 ||
        !reversalAmount.equals(effectiveAmount)) {
      throw new ValidationError("Reversal amount must equal the full authorized or captured amount");
    }

    const reversal = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.updateMany({
        where: { id: original.id, status: original.status },
        data: { status: "REVERSED" },
      });
      if (updated.count !== 1) {
        throw new AppError("Transaction status changed while reversal was being processed", 409, "TRANSACTION_STATE_CONFLICT");
      }
      return tx.transaction.create({
        data: {
          stan,
          merchantId: original.merchantId,
          terminalId: original.terminalId,
          type: "REVERSAL",
          status: "REVERSED",
          amount: reversalAmount.toNumber(),
          currency: original.currency,
          responseCode: "00",
          responseMessage: "Reversal accepted",
          mti: "0410",
          processedAt: new Date(),
          metadata: {
            originalStan: input.originalStan,
            reason: input.reason ?? "Customer request",
          },
        },
      });
    });

    logger.info({ stan, originalStan: input.originalStan, reversalId: reversal.id }, "Transaction reversed");

    return {
      accepted: true,
      responseCode: "00",
      responseMessage: "Reversal accepted",
      stan,
      transactionId: reversal.id,
    };
  }

  /**
   * Capture a pre-authorized transaction.
   * Records the captured amount. Settlement is the point where ledger entries are posted.
   */
  async capture(input: {
    stan: string;
    amount?: string; // optional: partial capture
    rrn: string;
  }): Promise<{
    accepted: boolean;
    responseCode: string;
    responseMessage: string;
    transactionId?: string;
  }> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { stan: input.stan },
    });

    if (!transaction) {
      return { accepted: false, responseCode: "25", responseMessage: "Transaction not found" };
    }

    if (transaction.status !== "AUTHORIZED") {
      return { accepted: false, responseCode: "57", responseMessage: `Cannot capture transaction with status ${transaction.status}` };
    }

    let captureAmount: Decimal;
    try {
      captureAmount = input.amount
        ? new Decimal(input.amount)
        : new Decimal(transaction.amount);
    } catch {
      throw new ValidationError("Capture amount must be a valid number");
    }

    if (!captureAmount.isFinite() || captureAmount.lte(0) || captureAmount.decimalPlaces() > 4) {
      throw new ValidationError("Capture amount must be positive with at most four decimal places");
    }
    if (captureAmount.gt(new Decimal(transaction.amount))) {
      return { accepted: false, responseCode: "13", responseMessage: "Capture amount exceeds authorization" };
    }

    const updated = await this.prisma.transaction.updateMany({
      where: { id: transaction.id, status: "AUTHORIZED" },
      data: {
        status: "CAPTURED",
        rrn: input.rrn,
        processedAt: new Date(),
        metadata: {
          ...(transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
            ? transaction.metadata as Record<string, unknown>
            : {}),
          captureAmount: captureAmount.toString(),
        },
      },
    });
    if (updated.count !== 1) {
      return { accepted: false, responseCode: "57", responseMessage: "Transaction status changed while capture was being processed" };
    }

    logger.info({ stan: input.stan, captureAmount: captureAmount.toString() }, "Transaction captured for settlement");

    return {
      accepted: true,
      responseCode: "00",
      responseMessage: "Capture accepted",
      transactionId: transaction.id,
    };
  }

  /**
   * List transactions with filters.
   */
  async listTransactions(filters: {
    merchantId?: string;
    terminalId?: string;
    status?: string;
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.terminalId) where.terminalId = filters.terminalId;
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: where as never,
        include: {
          merchant: { select: { code: true, legalName: true } },
          terminal: { select: { tid: true } },
          route: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.transaction.count({ where: where as never }),
    ]);

    return {
      data: transactions,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  async getTransaction(stan: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { stan },
      include: {
        merchant: { select: { code: true, legalName: true } },
        terminal: { select: { tid: true, serialNumber: true } },
        route: { select: { name: true, type: true, endpoint: true } },
        transactionLogs: { orderBy: { createdAt: "asc" } },
        chargebacks: true,
      },
    });

    if (!tx) throw new NotFoundError("Transaction", stan);
    return tx;
  }

  // ── Private Helpers ─────────────────────────────

  private maskCard(pan: string): string {
    if (pan.length < 8) return "****";
    return pan.slice(0, 6) + "****" + pan.slice(-4);
  }

  private async decline(
    responseCode: string,
    responseMessage: string,
    stan: string,
    terminalId: string,
    merchantId?: string,
  ) {
    // Create a declined transaction record
    if (merchantId) {
      await this.prisma.transaction.create({
        data: {
          stan,
          merchantId,
          terminalId,
          type: "AUTHORIZATION",
          status: "DECLINED",
          amount: 0,
          currency: "USD",
          responseCode,
          responseMessage,
          mti: "0110",
          processedAt: new Date(),
        },
      }).catch(() => { /* ignore if creation fails */ });
    }

    logger.info({ stan, responseCode, responseMessage }, "Transaction declined");

    return {
      approved: false,
      responseCode,
      responseMessage,
      stan,
      transactionId: "",
    };
  }
}
