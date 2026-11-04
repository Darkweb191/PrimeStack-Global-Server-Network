import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "../../core/decimal.js";
import {
  AccountNotActiveError,
  InsufficientFundsError,
  LedgerError,
  UnbalancedEntryError,
} from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type {
  AccountBalance,
  CreateAccountInput,
  HoldFundsInput,
  JournalEntryWithLines,
  PostEntryInput,
  ReverseEntryInput,
} from "./types.js";

/**
 * Ledger Service — Double-Entry Accounting Engine
 *
 * This is the financial core of PrimeStack Switch. Every transfer,
 * settlement, fee, chargeback, and adjustment writes immutable
 * journal entries through this service.
 *
 * Key guarantees:
 *   1. Double-entry: every entry has debits == credits (enforced)
 *   2. Atomicity: balance updates and entry creation happen in a single transaction
 *   3. Immutability: posted entries are never modified — reversals create new entries
 *   4. Insufficient funds: debits are rejected if available balance < debit amount
 *   5. Audit trail: every entry has a reference, source, and posted-by
 */
export class LedgerService {
  constructor(private prisma: PrismaClient) {}

  // ── Account Management ──────────────────────────

  async createAccount(input: CreateAccountInput) {
    // Validate parent exists if specified
    if (input.parentId) {
      const parent = await this.prisma.account.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new LedgerError(`Parent account not found: ${input.parentId}`);
      }
    }

    const account = await this.prisma.account.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        subtype: input.subtype,
        currency: input.currency,
        parentId: input.parentId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    logger.info({ accountCode: account.code, type: account.type }, "Ledger account created");
    return account;
  }

  async getAccount(accountCode: string) {
    return this.prisma.account.findUnique({
      where: { code: accountCode },
      include: { parent: true, children: true },
    });
  }

  async getBalance(accountCode: string): Promise<AccountBalance> {
    const account = await this.prisma.account.findUnique({
      where: { code: accountCode },
    });

    if (!account) {
      throw new LedgerError(`Account not found: ${accountCode}`);
    }

    const available = new Decimal(account.balance).minus(account.heldBalance);

    return {
      accountCode: account.code,
      balance: account.balance.toString(),
      heldBalance: account.heldBalance.toString(),
      availableBalance: available.toString(),
      currency: account.currency,
      status: account.status,
    };
  }

  // ── Journal Entry Posting ────────────────────────

  /**
   * Post a journal entry with double-entry validation.
   *
   * The entire operation is atomic:
   *   1. Validate debits == credits
   *   2. Check debit-normal accounts can cover debits that reduce their balance
   *   3. Create the entry (status: POSTED)
   *   4. Create all journal lines
   *   5. Update all account balances atomically
   *
   * If any step fails, the entire transaction rolls back.
   */
  async postEntry(input: PostEntryInput): Promise<JournalEntryWithLines> {
    // ── Pre-flight validation ──
    const { totalDebits, totalCredits, lines } = this.validateBalanced(input.lines);

    if (!totalDebits.equals(totalCredits)) {
      throw new UnbalancedEntryError(totalDebits.toString(), totalCredits.toString());
    }

    // Check for duplicate reference
    const existing = await this.prisma.journalEntry.findUnique({
      where: { reference: input.reference },
    });
    if (existing) {
      throw new LedgerError(`Journal entry reference already exists: ${input.reference}`);
    }

    // ── Atomic posting within a transaction ──
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve all accounts and validate status
      const accountMap = await this.resolveAccounts(tx, lines);

      // 2. Check sufficient funds for all debit lines
      for (const line of lines) {
        const account = accountMap.get(line.accountCode)!;
        if (account.status !== "ACTIVE") {
          throw new AccountNotActiveError(account.code, account.status);
        }

        const debit = new Decimal(line.debit);
        const debitReducesBalance = account.type !== "ASSET" && account.type !== "EXPENSE";
        if (debitReducesBalance && debit.greaterThan(0)) {
          const available = new Decimal(account.balance).minus(account.heldBalance);
          if (available.lessThan(debit)) {
            throw new InsufficientFundsError(
              account.code,
              available.toString(),
              debit.toString(),
            );
          }
        }
      }

      // 3. Create the journal entry
      const entry = await tx.journalEntry.create({
        data: {
          reference: input.reference,
          entryType: input.entryType,
          description: input.description,
          source: input.source,
          status: "POSTED",
          postedAt: new Date(),
          postedBy: input.postedBy,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      // 4. Create journal lines and update balances
      for (const line of lines) {
        const account = accountMap.get(line.accountCode)!;
        const debit = new Decimal(line.debit);
        const credit = new Decimal(line.credit);

        await tx.journalLine.create({
          data: {
            entryId: entry.id,
            accountId: account.id,
            debit: debit.toNumber(),
            credit: credit.toNumber(),
            currency: account.currency,
          },
        });

        // Update balance: +credit increases, +debit decreases
        // For an ASSET/EXPENSE account: debit increases balance, credit decreases
        // For a LIABILITY/EQUITY/REVENUE account: credit increases balance, debit decreases
        const balanceChange = this.computeBalanceChange(
          account.type,
          debit,
          credit,
        );

        await this.updateAccountBalanceAtomic(tx, account.id, balanceChange);
      }

      logger.info(
        {
          reference: entry.reference,
          entryType: entry.entryType,
          totalDebits: totalDebits.toString(),
          totalCredits: totalCredits.toString(),
          lineCount: lines.length,
        },
        "Journal entry posted",
      );

      // 5. Return entry with lines and accounts
      return tx.journalEntry.findUnique({
        where: { id: entry.id },
        include: {
          lines: {
            include: { account: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }) as Promise<JournalEntryWithLines>;
    });
  }

  /**
   * Reverse a posted journal entry by creating a mirror entry
   * that flips all debits and credits.
   *
   * The original entry's status changes to REVERSED.
   * A new REVERSAL entry is posted with reversed lines.
   */
  async reverseEntry(input: ReverseEntryInput): Promise<JournalEntryWithLines> {
    const original = await this.prisma.journalEntry.findUnique({
      where: { reference: input.reference },
      include: { lines: { include: { account: true } } },
    });

    if (!original) {
      throw new LedgerError(`Journal entry not found: ${input.reference}`);
    }

    if (original.status === "REVERSED") {
      throw new LedgerError(`Entry already reversed: ${input.reference}`);
    }

    if (original.status !== "POSTED") {
      throw new LedgerError(`Cannot reverse entry with status: ${original.status}`);
    }

    const reversalReference = `REV-${input.reference}`;

    return this.prisma.$transaction(async (tx) => {
      // Mark original as reversed
      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      });

      // Create reversal entry with flipped debits/credits
      const reversalEntry = await tx.journalEntry.create({
        data: {
          reference: reversalReference,
          entryType: "REVERSAL",
          description: `Reversal of ${input.reference}: ${input.reason}`,
          source: original.source,
          status: "POSTED",
          postedAt: new Date(),
          postedBy: input.postedBy,
          reversalOf: input.reference,
        },
      });

      for (const line of original.lines) {
        // Flip debit and credit
        const originalDebit = new Decimal(line.debit);
        const originalCredit = new Decimal(line.credit);

        await tx.journalLine.create({
          data: {
            entryId: reversalEntry.id,
            accountId: line.accountId,
            debit: originalCredit.toNumber(), // flipped
            credit: originalDebit.toNumber(), // flipped
            currency: line.currency,
          },
        });

        // Reverse the balance change
        const balanceChange = this.computeBalanceChange(
          line.account.type,
          originalCredit, // flipped
          originalDebit, // flipped
        );

        await this.updateAccountBalanceAtomic(tx, line.accountId, balanceChange);
      }

      logger.info(
        { originalRef: input.reference, reversalRef: reversalReference },
        "Journal entry reversed",
      );

      return tx.journalEntry.findUnique({
        where: { id: reversalEntry.id },
        include: {
          lines: {
            include: { account: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }) as Promise<JournalEntryWithLines>;
    });
  }

  /**
   * Hold funds — move amount from available balance to held balance.
   * Used for pending transactions (e.g. pre-authorization).
   */
  async holdFunds(input: HoldFundsInput) {
    const amount = new Decimal(input.amount);
    if (amount.isNaN() || amount.lte(0)) {
      throw new LedgerError(`Invalid hold amount: ${input.amount}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { code: input.accountCode },
      });

      if (!account) {
        throw new LedgerError(`Account not found: ${input.accountCode}`);
      }

      if (account.status !== "ACTIVE") {
        throw new AccountNotActiveError(account.code, account.status);
      }

      const available = new Decimal(account.balance).minus(account.heldBalance);
      if (available.lt(amount)) {
        throw new InsufficientFundsError(
          account.code,
          available.toString(),
          amount.toString(),
        );
      }

      // Move funds to held balance
      const updated = await tx.account.update({
        where: { id: account.id },
        data: {
          heldBalance: new Decimal(account.heldBalance).plus(amount).toNumber(),
        },
      });

      logger.info(
        { accountCode: account.code, heldAmount: amount.toString(), reference: input.reference },
        "Funds held",
      );

      return {
        accountCode: account.code,
        heldAmount: amount.toString(),
        newHeldBalance: updated.heldBalance.toString(),
        availableBalance: new Decimal(updated.balance).minus(updated.heldBalance).toString(),
      };
    });
  }

  /**
   * Release held funds — move amount back from held to available.
   * Used when a held transaction is cancelled or expires.
   */
  async releaseFunds(accountCode: string, amount: string, reference: string) {
    const amt = new Decimal(amount);
    if (amt.isNaN() || amt.lte(0)) {
      throw new LedgerError(`Invalid release amount: ${amount}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { code: accountCode },
      });

      if (!account) {
        throw new LedgerError(`Account not found: ${accountCode}`);
      }

      if (new Decimal(account.heldBalance).lt(amt)) {
        throw new LedgerError(
          `Cannot release ${amount} — held balance is only ${account.heldBalance}`,
        );
      }

      const updated = await tx.account.update({
        where: { id: account.id },
        data: {
          heldBalance: new Decimal(account.heldBalance).minus(amt).toNumber(),
        },
      });

      logger.info(
        { accountCode, releasedAmount: amt.toString(), reference },
        "Held funds released",
      );

      return {
        accountCode,
        releasedAmount: amt.toString(),
        newHeldBalance: updated.heldBalance.toString(),
        availableBalance: new Decimal(updated.balance).minus(updated.heldBalance).toString(),
      };
    });
  }

  async getEntry(reference: string): Promise<JournalEntryWithLines | null> {
    return this.prisma.journalEntry.findUnique({
      where: { reference },
      include: {
        lines: {
          include: { account: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async listEntries(filters: {
    entryType?: string;
    status?: string;
    source?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.JournalEntryWhereInput = {};
    if (filters.entryType) where.entryType = filters.entryType as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.source) where.source = filters.source;

    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
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

  async listAccountEntries(
    accountCode: string,
    page: number,
    pageSize: number,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { code: accountCode },
    });
    if (!account) {
      throw new LedgerError(`Account not found: ${accountCode}`);
    }

    const [lines, total] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: { accountId: account.id },
        include: { entry: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.journalLine.count({
        where: { accountId: account.id },
      }),
    ]);

    return {
      data: lines,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ── Private Helpers ─────────────────────────────

  private validateBalanced(
    lines: PostEntryInput["lines"],
  ): { totalDebits: Decimal; totalCredits: Decimal; lines: typeof lines } {
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    for (const line of lines) {
      const debit = new Decimal(line.debit);
      const credit = new Decimal(line.credit);

      if (debit.isNaN() || credit.isNaN()) {
        throw new LedgerError(`Invalid line amount: debit=${line.debit}, credit=${line.credit}`);
      }

      if (debit.lt(0) || credit.lt(0)) {
        throw new LedgerError(`Negative amounts are not allowed in journal lines`);
      }

      // A line should not have both debit and credit
      if (debit.gt(0) && credit.gt(0)) {
        throw new LedgerError(
          `Line for account ${line.accountCode} has both debit and credit — each line must be one or the other`,
        );
      }

      totalDebits = totalDebits.plus(debit);
      totalCredits = totalCredits.plus(credit);
    }

    return { totalDebits, totalCredits, lines };
  }

  private async resolveAccounts(
    tx: Prisma.TransactionClient,
    lines: PostEntryInput["lines"],
  ) {
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({
      where: { code: { in: codes } },
    });

    const accountMap = new Map(accounts.map((a) => [a.code, a]));

    for (const code of codes) {
      if (!accountMap.has(code)) {
        throw new LedgerError(`Account not found: ${code}`);
      }
    }

    return accountMap;
  }

  /**
   * Compute the balance change for an account given its type.
   *
   * Accounting rules:
   *   ASSET/EXPENSE:  debit increases, credit decreases (normal balance is debit)
   *   LIABILITY/EQUITY/REVENUE: credit increases, debit decreases (normal balance is credit)
   */
  private computeBalanceChange(
    accountType: string,
    debit: Decimal,
    credit: Decimal,
  ): Decimal {
    const isDebitNormal =
      accountType === "ASSET" || accountType === "EXPENSE";

    if (isDebitNormal) {
      return debit.minus(credit);
    } else {
      return credit.minus(debit);
    }
  }

  /**
   * Atomically update an account's balance.
   * Uses a conditional update to prevent negative balances under concurrency.
   */
  private async updateAccountBalanceAtomic(
    tx: Prisma.TransactionClient,
    accountId: string,
    change: Decimal,
  ) {
    // For positive changes (credits to liability/equity/revenue, or debits to asset/expense),
    // we can update directly.
    //
    // For negative changes, we need to ensure the result doesn't go below held balance.
    // We use updateMany with a conditional where clause — if it affects 0 rows,
    // the update failed due to insufficient funds.

    if (change.gte(0)) {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: change.toNumber() } },
      });
    } else {
      // Negative change — use raw SQL for conditional update
      const absChange = change.abs();
      const result = await tx.$executeRaw`
        UPDATE "Account"
        SET "balance" = "balance" - ${absChange.toNumber()}::numeric
        WHERE "id" = ${accountId}
          AND ("balance" - "heldBalance" - ${absChange.toNumber()}::numeric) >= 0
      `;

      if (result === 0) {
        throw new InsufficientFundsError(
          accountId,
          "0",
          absChange.toString(),
        );
      }
    }
  }
}
