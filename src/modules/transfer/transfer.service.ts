import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import {
  AppError,
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { generateReference } from "../../shared/utils/crypto.js";
import type { CreateTransferInput, BulkTransferInput } from "./types.js";

/**
 * Transfer Service — Fund Movement Engine
 *
 * Orchestrates transfers between wallets, terminals, merchants, and banks.
 * Every transfer creates an immutable journal entry through the LedgerService.
 *
 * Supported types:
 *   T2T      — Terminal to Terminal
 *   S2S      — Server to Server
 *   IP2IP    — IP to IP
 *   WALLET   — Wallet to Wallet
 *   MERCHANT — Merchant to Merchant
 *   BULK     — Batch of transfers from one source
 *
 * Fee handling:
 *   If a fee is specified, the source is debited (amount + fee),
 *   the destination is credited (amount), and the fee account
 *   is credited (fee). Debits always equal credits.
 */
export class TransferService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
    private walletService: WalletService,
  ) {}

  async createTransfer(input: CreateTransferInput) {
    const amount = new Decimal(input.amount);
    const fee = new Decimal(input.feeAmount || "0");

    // Validate amounts
    if (amount.lte(0)) {
      throw new ValidationError("Transfer amount must be positive");
    }
    if (fee.lt(0)) {
      throw new ValidationError("Fee amount cannot be negative");
    }

    // Resolve source and destination ledger account codes
    const sourceAccountCode = await this.resolveAccountCode(
      input.sourceType,
      input.sourceId,
      input.currency,
    );
    const destAccountCode = await this.resolveAccountCode(
      input.destType,
      input.destId,
      input.currency,
    );

    // Check sufficient funds on source
    if (input.sourceType === "WALLET") {
      const hasFunds = await this.walletService.checkSufficientFunds(
        input.sourceId,
        amount.plus(fee).toString(),
      );
      if (!hasFunds) {
        throw new InsufficientFundsError(
          input.sourceId,
          "0",
          amount.plus(fee).toString(),
        );
      }
    }

    const reference = generateReference("TRF");
    const netAmount = amount.minus(fee);

    // Create transfer record
    const transfer = await this.prisma.transfer.create({
      data: {
        reference,
        type: input.type,
        status: "PROCESSING",
        amount: amount.toNumber(),
        currency: input.currency,
        feeAmount: fee.toNumber(),
        netAmount: netAmount.toNumber(),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        destType: input.destType,
        destId: input.destId,
        sourceAccountId: sourceAccountCode,
        destAccountId: destAccountCode,
        merchantId: input.merchantId,
        description: input.description,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    try {
      // Build journal lines — double entry with optional fee
      const lines: Array<{ accountCode: string; debit: string; credit: string }> = [
        {
          accountCode: sourceAccountCode,
          debit: amount.plus(fee).toString(),
          credit: "0",
        },
        {
          accountCode: destAccountCode,
          debit: "0",
          credit: amount.toString(),
        },
      ];

      // Add fee line if there's a fee
      if (fee.gt(0)) {
        const feeAccountCode = `FEE-${input.type}-${input.currency}`;
        lines.push({
          accountCode: feeAccountCode,
          debit: "0",
          credit: fee.toString(),
        });
      }

      // Post the journal entry — atomic, double-entry validated
      const journalEntry = await this.ledgerService.postEntry({
        reference: `JE-${reference}`,
        entryType: "TRANSFER",
        description: `${input.type} transfer: ${input.description ?? reference}`,
        source: input.type,
        lines,
        postedBy: input.merchantId ?? "system",
      });

      // Update transfer to completed
      const completed = await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: {
          status: "COMPLETED",
          journalEntryRef: journalEntry.reference,
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });

      logger.info(
        {
          reference,
          type: input.type,
          amount: amount.toString(),
          fee: fee.toString(),
          sourceType: input.sourceType,
          destType: input.destType,
        },
        "Transfer completed",
      );

      return completed;
    } catch (error) {
      // Mark transfer as failed
      await this.prisma.transfer.update({
        where: { id: transfer.id },
        data: {
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "Unknown error",
          processedAt: new Date(),
        },
      });

      logger.error({ err: error, reference }, "Transfer failed");
      throw error;
    }
  }

  /**
   * Bulk transfer — process multiple transfers from a single source.
   * Each item creates its own transfer record and journal entry.
   * Partial completion is possible — some items may fail while others succeed.
   */
  async createBulkTransfer(input: BulkTransferInput) {
    const reference = generateReference("BLK");
    const results: Array<{ index: number; status: string; reference?: string; error?: string }> = [];

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalAmount = new Decimal(0);

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      try {
        const transfer = await this.createTransfer({
          type: "BULK",
          amount: item.amount,
          currency: input.currency,
          feeAmount: item.feeAmount || "0",
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          destType: item.destType,
          destId: item.destId,
          merchantId: input.merchantId,
          description: item.description ?? `Bulk transfer item ${i + 1}`,
          metadata: { bulkReference: reference, itemIndex: i, ...(input.metadata ?? {}) },
        });

        results.push({ index: i, status: "COMPLETED", reference: transfer.reference });
        totalSuccess++;
        totalAmount = totalAmount.plus(new Decimal(item.amount));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.push({ index: i, status: "FAILED", error: message });
        totalFailed++;
      }
    }

    logger.info(
      { reference, totalSuccess, totalFailed, totalAmount: totalAmount.toString() },
      "Bulk transfer completed",
    );

    return {
      reference,
      totalItems: input.items.length,
      totalSuccess,
      totalFailed,
      totalAmount: totalAmount.toString(),
      currency: input.currency,
      results,
    };
  }

  async getTransfer(reference: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { reference },
    });

    if (!transfer) {
      throw new NotFoundError("Transfer", reference);
    }

    return transfer;
  }

  async listTransfers(filters: {
    type?: string;
    status?: string;
    merchantId?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.TransferWhereInput = {};
    if (filters.type) where.type = filters.type as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.merchantId) where.merchantId = filters.merchantId;

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return {
      data: transfers,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  /**
   * Reverse a completed transfer by reversing its journal entry.
   */
  async reverseTransfer(reference: string, reason: string, reversedBy?: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { reference },
    });

    if (!transfer) {
      throw new NotFoundError("Transfer", reference);
    }

    if (transfer.status !== "COMPLETED") {
      throw new ConflictError(`Cannot reverse transfer with status: ${transfer.status}`);
    }

    if (!transfer.journalEntryRef) {
      throw new AppError("Transfer has no linked journal entry", 500, "TRANSFER_NO_JOURNAL");
    }

    const reversal = await this.ledgerService.reverseEntry({
      reference: transfer.journalEntryRef,
      reason,
      postedBy: reversedBy,
    });

    // Update transfer status
    const updated = await this.prisma.transfer.update({
      where: { id: transfer.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
      },
    });

    logger.info({ reference, reversalRef: reversal.reference }, "Transfer reversed");
    return updated;
  }

  // ── Private Helpers ─────────────────────────────

  private async resolveAccountCode(
    entityType: string,
    entityId: string,
    currency: string,
  ): Promise<string> {
    switch (entityType) {
      case "WALLET": {
        const wallet = await this.prisma.wallet.findUnique({
          where: { walletAddress: entityId },
          include: { account: true },
        });
        if (!wallet) {
          throw new NotFoundError("Wallet", entityId);
        }
        if (wallet.status !== "ACTIVE") {
          throw new ConflictError(`Wallet ${entityId} is ${wallet.status}`);
        }
        return wallet.account.code;
      }

      case "MERCHANT": {
        // Resolve merchant's primary settlement account
        const merchant = await this.prisma.merchant.findUnique({
          where: { id: entityId },
        });
        if (!merchant) {
          throw new NotFoundError("Merchant", entityId);
        }
        return `MERCHANT-${merchant.code}-${currency}`;
      }

      case "TERMINAL": {
        // Look up by TID (terminal identifier like "PST-001-PRIME") OR by UUID
        let terminal = await this.prisma.terminal.findUnique({
          where: { tid: entityId },
        }) ?? await this.prisma.terminal.findUnique({
          where: { id: entityId },
        });
        if (!terminal) {
          // EXTERNAL TERMINAL: auto-create if not found in database
          // This allows any terminal worldwide to send T2T transfers to our platform
          logger.info({ tid: entityId, currency }, "External terminal not found - auto-creating");
          const merchant = await this.prisma.merchant.findFirst({ where: { status: "ACTIVE" } });
          if (!merchant) throw new NotFoundError("Merchant", "active merchant");
          terminal = await this.prisma.terminal.create({
            data: {
              tid: entityId,
              serialNumber: "EXT-" + entityId + "-" + Date.now(),
              merchantId: merchant.id,
              model: "External Terminal",
              location: "External / International",
              country: "XX",
              status: "ACTIVE",
            },
          });
          logger.info({ tid: entityId, id: terminal.id }, "External terminal auto-created");
        }
        // Ensure the terminal has a linked ledger account ? create if missing
        const accountCode = `TERMINAL-${terminal.tid}-${currency}`;
        const existingAcct = await this.ledgerService.getAccount(accountCode);
        if (!existingAcct) {
          await this.ledgerService.createAccount({
            code: accountCode,
            name: `Terminal: ${terminal.tid} (${currency})`,
            type: "ASSET",
            subtype: "TERMINAL",
            currency,
            metadata: { terminalId: terminal.tid, merchantId: terminal.merchantId },
          });
          logger.info({ accountCode, tid: terminal.tid }, "Created terminal ledger account");
        }
        return accountCode;
      }

      case "BANK": {
        return `BANK-${entityId}-${currency}`;
      }

      default:
        throw new ValidationError(`Unknown entity type: ${entityType}`);
    }
  }

}
