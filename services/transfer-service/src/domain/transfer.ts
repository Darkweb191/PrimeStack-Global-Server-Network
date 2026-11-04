import { Pool } from "pg";
import { Decimal } from "decimal.js";

/**
 * Transfer Service Domain
 *
 * Orchestrates fund movements between accounts.
 * This service is the coordinator — it does NOT touch balances directly.
 * Balance changes happen exclusively in the Ledger Service.
 *
 * Flow for each transfer:
 *   1. validate()     — parse and validate input
 *   2. checkRisk()    — call Risk Service (HTTP)
 *   3. postToLedger() — call Ledger Service (HTTP) — the ONLY balance change
 *   4. record()       — mark transfer COMPLETED with journal_entry_ref
 *   5. publishEvent() — push to message queue for notifications/settlement
 *
 * Idempotency:
 *   The caller supplies transfer_ref. If a transfer with that ref
 *   already exists, the existing record is returned without re-processing.
 *   This means safe retries on network failures.
 *
 * Failure handling:
 *   - If Ledger Service rejects: transfer → FAILED, no balance change
 *   - If publish fails: transfer stays COMPLETED (retry publish separately)
 *   - Reversal: calls Ledger Service reversal, then marks transfer REVERSED
 */

export class TransferError extends Error {
  constructor(
    message: string,
    public code: string,
    public httpStatus = 422,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

export type TransferType = "T2T" | "S2S" | "IP2IP" | "WALLET" | "MERCHANT" | "BULK";

export interface CreateTransferInput {
  transferRef:  string;
  type:         TransferType;
  sourceType:   string;
  sourceId:     string;
  destType:     string;
  destId:       string;
  amount:       string;
  currency:     string;
  feeAmount?:   string;
  description?: string;
  metadata?:    Record<string, unknown>;
}

export interface TransferRecord {
  id:               string;
  transferRef:      string;
  type:             string;
  status:           string;
  sourceType:       string;
  sourceId:         string;
  destType:         string;
  destId:           string;
  amount:           string;
  currency:         string;
  feeAmount:        string;
  netAmount:        string;
  journalEntryRef:  string | null;
  riskScore:        number | null;
  riskLevel:        string | null;
  failureCode:      string | null;
  failureReason:    string | null;
  createdAt:        Date;
}

/**
 * Initiate a transfer.
 *
 * This function:
 *   1. Validates the input
 *   2. Creates the transfer record in INITIATED state
 *   3. Returns the record — the actual execution is async
 *      (driven by the worker/consumer in production, or synchronous in dev)
 *
 * Idempotent: if transferRef already exists, returns existing record.
 */
export async function initiate(
  pool: Pool,
  input: CreateTransferInput,
): Promise<TransferRecord> {

  // Validate amount
  const amount = new Decimal(input.amount);
  if (amount.lte(0)) {
    throw new TransferError("Amount must be positive", "INVALID_AMOUNT");
  }

  const fee = new Decimal(input.feeAmount ?? "0");
  if (fee.lt(0)) {
    throw new TransferError("Fee cannot be negative", "INVALID_FEE");
  }
  if (fee.gt(amount)) {
    throw new TransferError("Fee cannot exceed amount", "FEE_EXCEEDS_AMOUNT");
  }

  // Idempotency check first
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM transfers WHERE transfer_ref = $1",
    [input.transferRef],
  );

  if (existing.rows.length > 0) {
    return getByRef(pool, input.transferRef);
  }

  // Create transfer record
  const result = await pool.query<{ id: string }>(
    `INSERT INTO transfers
       (transfer_ref, transfer_type, status,
        source_type, source_id, dest_type, dest_id,
        amount, currency, fee_amount, description, metadata)
     VALUES ($1,$2,'INITIATED',$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.transferRef,
      input.type,
      input.sourceType,
      input.sourceId,
      input.destType,
      input.destId,
      amount.toString(),
      input.currency.toUpperCase(),
      fee.toString(),
      input.description ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );

  return getById(pool, result.rows[0].id);
}

/**
 * Mark a transfer as completed after the Ledger Service confirms posting.
 */
export async function complete(
  pool: Pool,
  transferRef: string,
  journalEntryRef: string,
  riskScore?: number,
  riskLevel?: string,
): Promise<void> {
  await pool.query(
    `UPDATE transfers SET
       status            = 'COMPLETED',
       journal_entry_ref = $1,
       risk_score        = $2,
       risk_level        = $3,
       processed_at      = NOW(),
       completed_at      = NOW()
     WHERE transfer_ref = $4
       AND status IN ('INITIATED','VALIDATING','PROCESSING')`,
    [journalEntryRef, riskScore ?? null, riskLevel ?? null, transferRef],
  );
}

/**
 * Mark a transfer as failed.
 */
export async function fail(
  pool: Pool,
  transferRef: string,
  failureCode: string,
  failureReason: string,
): Promise<void> {
  await pool.query(
    `UPDATE transfers SET
       status         = 'FAILED',
       failure_code   = $1,
       failure_reason = $2,
       processed_at   = NOW()
     WHERE transfer_ref = $3
       AND status NOT IN ('COMPLETED','REVERSED')`,
    [failureCode, failureReason, transferRef],
  );
}

/**
 * Mark a transfer as reversed.
 */
export async function reverse(
  pool: Pool,
  transferRef: string,
  reason: string,
): Promise<void> {
  const transfer = await getByRef(pool, transferRef);

  if (transfer.status !== "COMPLETED") {
    throw new TransferError(
      `Cannot reverse transfer with status: ${transfer.status}`,
      "CANNOT_REVERSE",
      409,
    );
  }

  if (!transfer.journalEntryRef) {
    throw new TransferError(
      "Transfer has no linked journal entry",
      "NO_JOURNAL_ENTRY",
      500,
    );
  }

  await pool.query(
    `UPDATE transfers SET
       status       = 'REVERSED',
       reversed_at  = NOW()
     WHERE transfer_ref = $1`,
    [transferRef],
  );
}

/**
 * Put a transfer on risk hold for manual review.
 */
export async function holdForRisk(
  pool: Pool,
  transferRef: string,
  reason: string,
  riskScore: number,
  riskLevel: string,
): Promise<void> {
  await pool.query(
    `UPDATE transfers SET
       status           = 'RISK_HOLD',
       risk_hold_reason = $1,
       risk_score       = $2,
       risk_level       = $3
     WHERE transfer_ref = $4
       AND status = 'VALIDATING'`,
    [reason, riskScore, riskLevel, transferRef],
  );
}

/**
 * List transfers with filtering and pagination.
 */
export async function list(
  pool: Pool,
  filters: {
    status?:       string;
    type?:         string;
    sourceId?:     string;
    destId?:       string;
    page:          number;
    pageSize:      number;
  },
): Promise<{ data: TransferRecord[]; total: number }> {

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`transfer_type = $${params.length}`);
  }
  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`source_id = $${params.length}`);
  }
  if (filters.destId) {
    params.push(filters.destId);
    conditions.push(`dest_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT * FROM transfers ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*) FROM transfers ${where}`, params),
  ]);

  return {
    data:  rows.rows.map(mapRow),
    total: parseInt(count.rows[0].count, 10),
  };
}

// ── Private helpers ─────────────────────────────────────────

async function getById(pool: Pool, id: string): Promise<TransferRecord> {
  const result = await pool.query("SELECT * FROM transfers WHERE id = $1", [id]);
  if (result.rows.length === 0) throw new TransferError(`Transfer not found: ${id}`, "NOT_FOUND", 404);
  return mapRow(result.rows[0]);
}

async function getByRef(pool: Pool, ref: string): Promise<TransferRecord> {
  const result = await pool.query("SELECT * FROM transfers WHERE transfer_ref = $1", [ref]);
  if (result.rows.length === 0) throw new TransferError(`Transfer not found: ${ref}`, "NOT_FOUND", 404);
  return mapRow(result.rows[0]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): TransferRecord {
  return {
    id:              row.id,
    transferRef:     row.transfer_ref,
    type:            row.transfer_type,
    status:          row.status,
    sourceType:      row.source_type,
    sourceId:        row.source_id,
    destType:        row.dest_type,
    destId:          row.dest_id,
    amount:          row.amount?.toString(),
    currency:        row.currency,
    feeAmount:       row.fee_amount?.toString(),
    netAmount:       row.net_amount?.toString(),
    journalEntryRef: row.journal_entry_ref,
    riskScore:       row.risk_score,
    riskLevel:       row.risk_level,
    failureCode:     row.failure_code,
    failureReason:   row.failure_reason,
    createdAt:       row.created_at,
  };
}
