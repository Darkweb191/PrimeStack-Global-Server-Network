import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { NotFoundError, ConflictError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

/**
 * Switch Core Service
 *
 * The financial operations layer:
 *   - Settlement: batch processing of authorized transactions
 *   - Reconciliation: matching internal vs external records
 *   - Chargebacks: dispute management with ledger reversals
 *   - Reversals: transaction reversal processing
 *
 * Every settlement and chargeback creates journal entries through
 * the LedgerService for audit-trail consistency.
 */
export class SwitchCoreService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
  ) {}

  // ── Settlement ──────────────────────────────────

  /**
   * Create a settlement batch for a merchant.
   * Collects captured transactions for a merchant, period, and currency,
   * then posts their settlement ledger entry.
   */
  async createSettlementBatch(merchantId: string, period?: string, currency?: string): Promise<{
    batchNumber: string;
    currency: string;
    transactionCount: number;
    totalAmount: string;
    totalFees: string;
    netAmount: string;
  }> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundError("Merchant", merchantId);
    }

    const settlementPeriod = period ?? new Date().toISOString().split("T")[0];

    const periodStart = new Date(`${settlementPeriod}T00:00:00.000Z`);
    if (!Number.isFinite(periodStart.getTime()) || periodStart.toISOString().slice(0, 10) !== settlementPeriod) {
      throw new ValidationError("Settlement period must be a valid YYYY-MM-DD date");
    }
    const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    const normalizedCurrency = currency?.toUpperCase();
    if (normalizedCurrency && !/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new ValidationError("Settlement currency must be a three-letter code");
    }

    // Settlement is posted only for captured transactions, not authorizations.
    const transactions = await this.prisma.transaction.findMany({
      where: {
        merchantId,
        status: "CAPTURED",
        settledAt: null,
        processedAt: { gte: periodStart, lt: periodEnd },
        ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
      },
      orderBy: [{ currency: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    if (transactions.length === 0) {
      throw new ValidationError("No captured, unsettled transactions found for this merchant, period, and currency");
    }
    const currencies = [...new Set(transactions.map((transaction) => transaction.currency))];
    if (currencies.length !== 1) {
      throw new ValidationError("Captured transactions use multiple currencies; specify one currency per settlement batch");
    }
    const settlementCurrency = currencies[0];
    const batchNumber = `STL-${merchant.code}-${settlementPeriod}-${settlementCurrency}`;
    if (await this.prisma.settlementBatch.findUnique({ where: { batchNumber } })) {
      throw new ConflictError(`Settlement batch already exists: ${batchNumber}`);
    }

    let totalAmount = new Decimal(0);
    let totalFees = new Decimal(0);

    for (const tx of transactions) {
      const metadata = tx.metadata && typeof tx.metadata === "object" && !Array.isArray(tx.metadata)
        ? tx.metadata as Record<string, unknown>
        : {};
      const capturedAmount = new Decimal(String(metadata.captureAmount ?? tx.amount));
      if (!capturedAmount.isFinite() || capturedAmount.lte(0) || capturedAmount.gt(new Decimal(tx.amount))) {
        throw new ValidationError(`Transaction ${tx.stan} has an invalid captured amount`);
      }
      const feeRatePercent = new Decimal(String(metadata.transactionFeeRatePercent ?? "0"));
      if (!feeRatePercent.isFinite() || feeRatePercent.lt(0) || feeRatePercent.gt(100)) {
        throw new ValidationError(`Transaction ${tx.stan} has an invalid configured fee rate`);
      }
      totalAmount = totalAmount.plus(capturedAmount);
      const fee = capturedAmount.mul(feeRatePercent).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
      totalFees = totalFees.plus(fee);
    }

    const netAmount = totalAmount.minus(totalFees);

    const reference = `STL-JE-${batchNumber}`;
    const merchantAccountCode = `MERCHANT-${merchant.code}-${settlementCurrency}`;
    const feeAccountCode = `FEE-SETTLEMENT-${settlementCurrency}`;
    const settlementAccountCode = `SETTLEMENT-${settlementCurrency}`;
    const transactionIds = transactions.map((transaction) => transaction.id).sort();
    let journalEntry = await this.ledgerService.getEntry(reference);
    if (journalEntry) {
      this.validateSettlementJournal(journalEntry.metadata, batchNumber, transactionIds, reference);
    } else {
      try {
        journalEntry = await this.ledgerService.postEntry({
          reference,
          entryType: "SETTLEMENT",
          description: `Settlement batch: ${batchNumber} (${transactions.length} transactions)`,
          source: "SETTLEMENT",
          lines: [
            { accountCode: settlementAccountCode, debit: totalAmount.toString(), credit: "0" },
            { accountCode: merchantAccountCode, debit: "0", credit: netAmount.toString() },
            ...(totalFees.gt(0) ? [{ accountCode: feeAccountCode, debit: "0", credit: totalFees.toString() }] : []),
          ],
          postedBy: "settlement-engine",
          metadata: { batchNumber, transactionCount: transactions.length, transactionIds },
        });
      } catch (error) {
        journalEntry = await this.ledgerService.getEntry(reference);
        if (!journalEntry) throw error;
        this.validateSettlementJournal(journalEntry.metadata, batchNumber, transactionIds, reference);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.updateMany({
        where: { id: { in: transactionIds }, status: "CAPTURED", settledAt: null },
        data: { status: "SETTLED", settledAt: new Date() },
      });
      if (updated.count !== transactions.length) {
        throw new ConflictError("One or more transactions changed while settlement was being processed");
      }
      await tx.settlementBatch.create({
        data: {
          batchNumber,
          merchantId,
          currency: settlementCurrency,
          status: "COMPLETED",
          period: settlementPeriod,
          totalAmount: totalAmount.toNumber(),
          totalFees: totalFees.toNumber(),
          netAmount: netAmount.toNumber(),
          transactionCount: transactions.length,
          journalEntryRef: reference,
          processedAt: new Date(),
          closedAt: new Date(),
        },
      });
    });

    logger.info(
      { batchNumber, merchantId, currency: settlementCurrency, transactionCount: transactions.length, netAmount: netAmount.toString() },
      "Settlement batch processed",
    );

    return {
      batchNumber,
      currency: settlementCurrency,
      transactionCount: transactions.length,
      totalAmount: totalAmount.toString(),
      totalFees: totalFees.toString(),
      netAmount: netAmount.toString(),
    };
  }

  private validateSettlementJournal(
    journalMetadata: unknown,
    batchNumber: string,
    transactionIds: string[],
    reference: string,
  ): void {
    const metadata = journalMetadata && typeof journalMetadata === "object" && !Array.isArray(journalMetadata)
      ? journalMetadata as Record<string, unknown>
      : {};
    const postedTransactionIds = Array.isArray(metadata.transactionIds)
      ? metadata.transactionIds.map(String).sort()
      : [];
    if (metadata.batchNumber !== batchNumber ||
        JSON.stringify(postedTransactionIds) !== JSON.stringify(transactionIds)) {
      throw new ConflictError(`A different ledger entry already uses settlement reference ${reference}`);
    }
  }

  async getSettlementBatch(batchNumber: string) {
    const batch = await this.prisma.settlementBatch.findUnique({
      where: { batchNumber },
      include: {
        merchant: true,
        reconciliations: true,
      },
    });
    if (!batch) {
      throw new NotFoundError("Settlement batch", batchNumber);
    }
    return batch;
  }

  async listSettlementBatches(filters: {
    merchantId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.SettlementBatchWhereInput = {};
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.status) where.status = filters.status as never;

    const [batches, total] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where,
        include: { merchant: { select: { code: true, legalName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.settlementBatch.count({ where }),
    ]);

    return {
      data: batches,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Reconciliation ──────────────────────────────

  async createReconciliationRecord(input: {
    settlementBatchId?: string;
    source: string;
    reference: string;
    expectedAmount: string;
    actualAmount: string;
    notes?: string;
  }) {
    const expected = new Decimal(input.expectedAmount);
    const actual = new Decimal(input.actualAmount);
    const difference = expected.minus(actual);

    const record = await this.prisma.reconciliationRecord.create({
      data: {
        settlementBatchId: input.settlementBatchId,
        source: input.source,
        reference: input.reference,
        expectedAmount: expected.toNumber(),
        actualAmount: actual.toNumber(),
        difference: difference.toNumber(),
        status: difference.isZero() ? "MATCHED" : "MISMATCHED",
        notes: input.notes,
      },
    });

    if (!difference.isZero()) {
      logger.warn(
        { reference: input.reference, expected: expected.toString(), actual: actual.toString(), difference: difference.toString() },
        "Reconciliation mismatch detected",
      );
    }

    return record;
  }

  async resolveReconciliation(id: string, resolvedBy: string, notes?: string) {
    const record = await this.prisma.reconciliationRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundError("Reconciliation record", id);
    }

    return this.prisma.reconciliationRecord.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedBy,
        resolvedAt: new Date(),
        notes: notes ?? record.notes,
      },
    });
  }

  async listReconciliations(filters: {
    settlementBatchId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ReconciliationRecordWhereInput = {};
    if (filters.settlementBatchId) where.settlementBatchId = filters.settlementBatchId;
    if (filters.status) where.status = filters.status as never;

    const [records, total] = await Promise.all([
      this.prisma.reconciliationRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.reconciliationRecord.count({ where }),
    ]);

    return {
      data: records,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Chargebacks ──────────────────────────────────

  async createChargeback(input: {
    transactionId: string;
    caseNumber: string;
    amount: string;
    currency?: string;
    reasonCode?: string;
    reasonDescription?: string;
  }) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });
    if (!transaction) {
      throw new NotFoundError("Transaction", input.transactionId);
    }

    if (transaction.status !== "SETTLED") {
      throw new ValidationError(
        `Only settled transactions can be charged back; current status is ${transaction.status}`,
      );
    }
    const metadata = transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
      ? transaction.metadata as Record<string, unknown>
      : {};
    let chargebackAmount: Decimal;
    try {
      chargebackAmount = new Decimal(input.amount);
    } catch {
      throw new ValidationError("Chargeback amount must be a valid number");
    }
    const maximumAmount = new Decimal(String(metadata.captureAmount ?? transaction.amount));
    const currency = (input.currency ?? transaction.currency).toUpperCase();
    if (!chargebackAmount.isFinite() || chargebackAmount.lte(0) || chargebackAmount.decimalPlaces() > 4 ||
        chargebackAmount.gt(maximumAmount) || currency !== transaction.currency) {
      throw new ValidationError("Chargeback amount or currency is invalid for the transaction");
    }

    // Check for existing chargeback
    const existing = await this.prisma.chargeback.findUnique({
      where: { caseNumber: input.caseNumber },
    });
    if (existing) {
      throw new ConflictError(`Chargeback case already exists: ${input.caseNumber}`);
    }

    const chargeback = await this.prisma.chargeback.create({
      data: {
        caseNumber: input.caseNumber,
        transactionId: input.transactionId,
        amount: chargebackAmount.toNumber(),
        currency,
        reasonCode: input.reasonCode,
        reasonDescription: input.reasonDescription,
        status: "OPEN",
      },
    });

    logger.info(
      { caseNumber: input.caseNumber, transactionId: input.transactionId, amount: input.amount },
      "Chargeback created",
    );

    return chargeback;
  }

  async processChargeback(caseNumber: string, action: "ACCEPTED" | "CONTESTED", processedBy?: string) {
    const chargeback = await this.prisma.chargeback.findUnique({
      where: { caseNumber },
      include: { transaction: { include: { merchant: true } } },
    });
    if (!chargeback) {
      throw new NotFoundError("Chargeback", caseNumber);
    }

    if (chargeback.status !== "OPEN") {
      throw new ConflictError(`Chargeback already processed: ${chargeback.status}`);
    }

    const reference = `CBK-${caseNumber}`;
    if (action === "ACCEPTED") {
      let journalEntry = await this.ledgerService.getEntry(reference);
      if (!journalEntry) {
        try {
          journalEntry = await this.ledgerService.postEntry({
            reference,
            entryType: "CHARGEBACK",
            description: `Chargeback: ${caseNumber} (${action})`,
            source: "CHARGEBACK",
            lines: [
              { accountCode: `MERCHANT-${chargeback.transaction.merchant.code}-${chargeback.currency}`, debit: chargeback.amount.toString(), credit: "0" },
              { accountCode: `CHARGEBACK-${chargeback.currency}`, debit: "0", credit: chargeback.amount.toString() },
            ],
            postedBy: processedBy ?? "chargeback-engine",
            metadata: { caseNumber, action, transactionId: chargeback.transactionId },
          });
        } catch (error) {
          journalEntry = await this.ledgerService.getEntry(reference);
          if (!journalEntry) throw error;
        }
      }
      const metadata = journalEntry.metadata && typeof journalEntry.metadata === "object" && !Array.isArray(journalEntry.metadata)
        ? journalEntry.metadata as Record<string, unknown>
        : {};
      if (metadata.caseNumber !== caseNumber || metadata.transactionId !== chargeback.transactionId) {
        throw new ConflictError(`A different ledger entry already uses chargeback reference ${reference}`);
      }
    }

    const updated = await this.prisma.chargeback.updateMany({
      where: { id: chargeback.id, status: "OPEN" },
      data: {
        status: action,
        ...(action === "ACCEPTED" ? { journalEntryRef: reference, resolvedAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError(`Chargeback status changed while ${action.toLowerCase()} was being processed`);
    }

    logger.info({ caseNumber, action }, "Chargeback processed");
    return this.prisma.chargeback.findUnique({ where: { id: chargeback.id } });
  }

  async listChargebacks(filters: {
    status?: string;
    transactionId?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.ChargebackWhereInput = {};
    if (filters.status) where.status = filters.status as never;
    if (filters.transactionId) where.transactionId = filters.transactionId;

    const [chargebacks, total] = await Promise.all([
      this.prisma.chargeback.findMany({
        where,
        include: { transaction: true },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.chargeback.count({ where }),
    ]);

    return {
      data: chargebacks,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }
}
