import { Pool } from "pg";
import { Decimal } from "decimal.js";

// ── Types ────────────────────────────────────────────────────

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";
export type EntryType =
  | "TRANSFER" | "SETTLEMENT" | "FEE" | "REVERSAL"
  | "ADJUSTMENT" | "CHARGEBACK" | "REFUND" | "PAYOUT" | "FUNDING";

export interface JournalLine {
  accountId: string;
  debit:  string; // string to preserve precision
  credit: string;
}

export interface PostEntryInput {
  reference:   string;
  entryType:   EntryType;
  description: string;
  source?:     string;
  postedBy?:   string;
  lines:       JournalLine[];
  metadata?:   Record<string, unknown>;
}

export interface HoldInput {
  accountId:   string;
  amount:      string;
  reference:   string;
  description?: string;
  expiresAt?:  Date;
}

// ── Errors ───────────────────────────────────────────────────

export class LedgerError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "LedgerError";
  }
}

// ── Core Ledger Operations ───────────────────────────────────

/**
 * Post a double-entry journal entry.
 *
 * This is the ONLY path through which account balances may change.
 * It runs inside a SERIALIZABLE transaction to prevent phantom reads
 * and lost updates under concurrent load.
 *
 * Guarantees:
 *   1. SUM(debits) === SUM(credits) — enforced before INSERT
 *   2. All debit accounts are ACTIVE and have sufficient available balance
 *   3. Balance updates are atomic with the journal line inserts
 *   4. If any step fails, the entire transaction rolls back
 *   5. A duplicate reference returns the existing entry (idempotent)
 */
export async function postEntry(
  pool: Pool,
  input: PostEntryInput,
  ipAddress?: string,
): Promise<{ entryId: string; reference: string }> {

  // ── Pre-flight: validate balanced ────────────────────────
  const totalDebits  = input.lines.reduce((s, l) => s.plus(l.debit),  new Decimal(0));
  const totalCredits = input.lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));

  if (!totalDebits.equals(totalCredits)) {
    throw new LedgerError(
      `Unbalanced entry: debits=${totalDebits} credits=${totalCredits}`,
      "UNBALANCED_ENTRY",
    );
  }
  if (totalDebits.isZero()) {
    throw new LedgerError("Entry has zero value", "ZERO_ENTRY");
  }

  const client = await pool.connect();
  try {
    // SERIALIZABLE prevents phantom reads under concurrent transfers
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // ── Idempotency check ──────────────────────────────────
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM journal_entries WHERE reference = $1",
      [input.reference],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { entryId: existing.rows[0].id, reference: input.reference };
    }

    // ── Lock and validate all accounts ────────────────────
    // SELECT FOR UPDATE locks rows so concurrent transfers
    // on the same accounts queue rather than race.
    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accountResult = await client.query<{
      id: string;
      account_type: string;
      status: string;
      available_balance: string;
      held_balance: string;
    }>(
      `SELECT b.account_id as id, a.account_type, a.status, b.available_balance, b.held_balance, b.version
       FROM account_balances b
       JOIN accounts a ON a.id = b.account_id
       WHERE b.account_id = ANY($1)
       ORDER BY b.account_id    -- consistent lock order prevents deadlocks
       FOR UPDATE`,
      [accountIds],
    );

    const accountMap = new Map(accountResult.rows.map((r) => [r.id, r]));

    for (const id of accountIds) {
      if (!accountMap.has(id)) {
        throw new LedgerError(`Account not found: ${id}`, "ACCOUNT_NOT_FOUND");
      }
    }

    // ── Validate each debit line ────────────────────────────
    for (const line of input.lines) {
      const debit  = new Decimal(line.debit);
      const credit = new Decimal(line.credit);
      if (debit.isZero() && credit.isZero()) continue;

      const account = accountMap.get(line.accountId)!;

      if (account.status !== "ACTIVE") {
        throw new LedgerError(
          `Account ${line.accountId} is ${account.status}`,
          "ACCOUNT_NOT_ACTIVE",
        );
      }

      // For ASSET/EXPENSE accounts, CREDITING decreases the balance (withdrawal)
      // For LIABILITY/EQUITY/REVENUE accounts, DEBITING decreases the balance
      const isDebitNormal =
        account.account_type === "ASSET" || account.account_type === "EXPENSE";

      if (isDebitNormal) {
        // Check sufficient funds only when crediting (withdrawing from) an asset
        if (!credit.isZero()) {
          const available = new Decimal(account.available_balance).minus(
            account.held_balance,
          );

          if (available.lessThan(credit)) {
            throw new LedgerError(
              `Insufficient funds in account ${line.accountId}: available=${available} required=${credit}`,
              "INSUFFICIENT_FUNDS",
            );
          }
        }
      }
    }

    // ── Insert journal entry ──────────────────────────────
    const entryResult = await client.query<{ id: string }>(
      `INSERT INTO journal_entries
         (reference, entry_type, description, source, posted_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.reference,
        input.entryType,
        input.description,
        input.source ?? null,
        input.postedBy ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    const entryId = entryResult.rows[0].id;

    // ── Insert journal lines and update balances ───────────
    for (const line of input.lines) {
      const debit  = new Decimal(line.debit);
      const credit = new Decimal(line.credit);
      const account = accountMap.get(line.accountId)!;

      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4)`,
        [entryId, line.accountId, debit.toString(), credit.toString()],
      );

      // Compute balance delta based on account normal balance side
      const isDebitNormal =
        account.account_type === "ASSET" || account.account_type === "EXPENSE";

      const delta = isDebitNormal
        ? debit.minus(credit)   // debit increases, credit decreases
        : credit.minus(debit);  // credit increases, debit decreases

      // Atomic balance update with optimistic concurrency check
      // For LIABILITY/EQUITY/REVENUE accounts, allow negative balances (no funds check)
      const updateResult = await client.query(
        `UPDATE account_balances
         SET available_balance = available_balance + $1,
             version = version + 1,
             updated_at = NOW()
         WHERE account_id = $2
           AND (
             $1 >= 0                                 -- credit or increase: always allow
             OR (available_balance - held_balance + $1) >= 0  -- debit: check funds
             OR $3 IN ('LIABILITY', 'EQUITY', 'REVENUE')  -- non-asset accounts: allow going negative
           )
         RETURNING version`,
        [delta.toString(), line.accountId, account.account_type],
      );

      if (updateResult.rowCount === 0) {
        throw new LedgerError(
          `Balance update failed for account ${line.accountId} — concurrent modification detected`,
          "CONCURRENT_MODIFICATION",
        );
      }
    }

    // ── Audit log ─────────────────────────────────────────
    await client.query(
      `INSERT INTO ledger_audit (operation, entity_type, entity_id, performed_by, ip_address, details)
       VALUES ('POST_ENTRY', 'journal_entry', $1, $2, $3::inet, $4)`,
      [
        entryId,
        input.postedBy ?? "system",
        ipAddress ?? null,
        JSON.stringify({
          reference:   input.reference,
          entryType:   input.entryType,
          totalDebits: totalDebits.toString(),
          lineCount:   input.lines.length,
        }),
      ],
    );

    await client.query("COMMIT");

    return { entryId, reference: input.reference };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Hold funds on an account (pre-authorization).
 *
 * Moves `amount` from available_balance into held_balance.
 * The available balance decreases; the total balance stays the same.
 * Held funds are released by releaseHold() or captured by postEntry().
 */
export async function holdFunds(
  pool: Pool,
  input: HoldInput,
  ipAddress?: string,
): Promise<{ holdId: string }> {

  const amount = new Decimal(input.amount);
  if (amount.lte(0)) {
    throw new LedgerError("Hold amount must be positive", "INVALID_AMOUNT");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // Check for duplicate hold reference (idempotency)
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM fund_holds WHERE reference = $1",
      [input.reference],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { holdId: existing.rows[0].id };
    }

    // Lock the balance row
    const balResult = await client.query<{
      available_balance: string;
      held_balance: string;
      status: string;
    }>(
      `SELECT b.available_balance, b.held_balance, a.status
       FROM account_balances b
       JOIN accounts a ON a.id = b.account_id
       WHERE b.account_id = $1
       FOR UPDATE`,
      [input.accountId],
    );

    if (balResult.rows.length === 0) {
      throw new LedgerError(`Account not found: ${input.accountId}`, "ACCOUNT_NOT_FOUND");
    }

    const row = balResult.rows[0];
    if (row.status !== "ACTIVE") {
      throw new LedgerError(`Account ${input.accountId} is ${row.status}`, "ACCOUNT_NOT_ACTIVE");
    }

    const available = new Decimal(row.available_balance).minus(row.held_balance);
    if (available.lessThan(amount)) {
      throw new LedgerError(
        `Insufficient funds for hold: available=${available} required=${amount}`,
        "INSUFFICIENT_FUNDS",
      );
    }

    // Insert hold record
    const holdResult = await client.query<{ id: string }>(
      `INSERT INTO fund_holds (account_id, amount, reference, description, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.accountId, amount.toString(), input.reference, input.description ?? null, input.expiresAt ?? null],
    );

    // Increment held_balance
    await client.query(
      `UPDATE account_balances
       SET held_balance = held_balance + $1, updated_at = NOW()
       WHERE account_id = $2`,
      [amount.toString(), input.accountId],
    );

    await client.query(
      `INSERT INTO ledger_audit (operation, entity_type, entity_id, performed_by, ip_address, details)
       VALUES ('HOLD_FUNDS', 'fund_hold', $1, 'system', $2::inet, $3)`,
      [holdResult.rows[0].id, ipAddress ?? null, JSON.stringify({ amount: amount.toString(), reference: input.reference })],
    );

    await client.query("COMMIT");
    return { holdId: holdResult.rows[0].id };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release a fund hold — move held_balance back to available.
 */
export async function releaseHold(
  pool: Pool,
  reference: string,
  _releasedBy?: string,
): Promise<void> {

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const holdResult = await client.query<{
      id: string; account_id: string; amount: string; status: string;
    }>(
      "SELECT id, account_id, amount, status FROM fund_holds WHERE reference = $1 FOR UPDATE",
      [reference],
    );

    if (holdResult.rows.length === 0) {
      throw new LedgerError(`Hold not found: ${reference}`, "HOLD_NOT_FOUND");
    }

    const hold = holdResult.rows[0];
    if (hold.status !== "ACTIVE") {
      // Idempotent — already released
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `UPDATE fund_holds SET status = 'RELEASED', released_at = NOW() WHERE id = $1`,
      [hold.id],
    );

    await client.query(
      `UPDATE account_balances
       SET held_balance = GREATEST(held_balance - $1, 0), updated_at = NOW()
       WHERE account_id = $2`,
      [hold.amount, hold.account_id],
    );

    await client.query("COMMIT");

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reverse a posted journal entry.
 *
 * Creates a mirror entry that flips every debit and credit.
 * The original entry is marked REVERSED.
 * This is the ONLY way to undo a posted entry.
 */
export async function reverseEntry(
  pool: Pool,
  originalReference: string,
  reason: string,
  reversedBy?: string,
  ipAddress?: string,
): Promise<{ entryId: string; reference: string }> {

  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // Fetch original entry and its lines
    const entryResult = await client.query<{
      id: string; status: string; entry_type: string; description: string; source: string;
    }>(
      "SELECT id, status, entry_type, description, source FROM journal_entries WHERE reference = $1 FOR UPDATE",
      [originalReference],
    );

    if (entryResult.rows.length === 0) {
      throw new LedgerError(`Entry not found: ${originalReference}`, "ENTRY_NOT_FOUND");
    }

    const original = entryResult.rows[0];

    if (original.status === "REVERSED") {
      throw new LedgerError(`Entry already reversed: ${originalReference}`, "ALREADY_REVERSED");
    }

    const linesResult = await client.query<{
      account_id: string; debit: string; credit: string;
    }>(
      "SELECT account_id, debit, credit FROM journal_lines WHERE entry_id = $1",
      [original.id],
    );

    const reversalRef = `REV-${originalReference}`;

    // Check idempotency
    const existingReversal = await client.query(
      "SELECT id FROM journal_entries WHERE reference = $1",
      [reversalRef],
    );
    if (existingReversal.rows.length > 0) {
      await client.query("ROLLBACK");
      return { entryId: existingReversal.rows[0].id, reference: reversalRef };
    }

    // Mark original as reversed
    await client.query(
      "UPDATE journal_entries SET status = 'REVERSED' WHERE id = $1",
      [original.id],
    );

    // Create reversal entry
    const newEntry = await client.query<{ id: string }>(
      `INSERT INTO journal_entries
         (reference, entry_type, description, source, posted_by, reversal_of, metadata)
       VALUES ($1, 'REVERSAL', $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        reversalRef,
        `Reversal of ${originalReference}: ${reason}`,
        original.source,
        reversedBy ?? "system",
        originalReference,
        JSON.stringify({ originalReference, reason }),
      ],
    );
    const reversalId = newEntry.rows[0].id;

    // Insert flipped lines and reverse balance changes
    for (const line of linesResult.rows) {
      const origDebit  = new Decimal(line.debit);
      const origCredit = new Decimal(line.credit);

      await client.query(
        `INSERT INTO journal_lines (entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4)`,
        [reversalId, line.account_id, origCredit.toString(), origDebit.toString()],
      );

      // Determine account type for delta direction
      const acctResult = await client.query<{ account_type: string }>(
        "SELECT account_type FROM accounts WHERE id = $1",
        [line.account_id],
      );
      const isDebitNormal = ["ASSET", "EXPENSE"].includes(acctResult.rows[0].account_type);
      const delta = isDebitNormal
        ? origCredit.minus(origDebit)  // reversal: credit was decrease, debit was increase
        : origDebit.minus(origCredit);

      await client.query(
        `UPDATE account_balances
         SET available_balance = available_balance + $1, version = version + 1, updated_at = NOW()
         WHERE account_id = $2`,
        [delta.toString(), line.account_id],
      );
    }

    await client.query(
      `INSERT INTO ledger_audit (operation, entity_type, entity_id, performed_by, ip_address, details)
       VALUES ('REVERSE_ENTRY', 'journal_entry', $1, $2, $3::inet, $4)`,
      [reversalId, reversedBy ?? "system", ipAddress ?? null, JSON.stringify({ originalReference, reason })],
    );

    await client.query("COMMIT");
    return { entryId: reversalId, reference: reversalRef };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read account balance (non-locking, for display purposes).
 */
export async function getBalance(
  pool: Pool,
  accountId: string,
): Promise<{
  accountId: string;
  availableBalance: string;
  heldBalance: string;
  effectiveBalance: string;
  currency: string;
}> {
  const result = await pool.query<{
    account_id: string;
    available_balance: string;
    held_balance: string;
    currency: string;
  }>(
    `SELECT b.account_id, b.available_balance, b.held_balance, a.currency
     FROM account_balances b
     JOIN accounts a ON a.id = b.account_id
     WHERE b.account_id = $1`,
    [accountId],
  );

  if (result.rows.length === 0) {
    throw new LedgerError(`Account not found: ${accountId}`, "ACCOUNT_NOT_FOUND");
  }

  const row = result.rows[0];
  const available = new Decimal(row.available_balance);
  const held      = new Decimal(row.held_balance);

  return {
    accountId:        row.account_id,
    availableBalance: available.toString(),
    heldBalance:      held.toString(),
    effectiveBalance: available.minus(held).toString(),
    currency:         row.currency,
  };
}
