import { Pool }    from "pg";
import { Decimal } from "decimal.js";
import { createHash } from "crypto";

/**
 * Settlement Service Domain
 *
 * Responsible for:
 *   1. Opening settlement batches per merchant per period
 *   2. Collecting completed transfers into a batch
 *   3. Computing gross, fees, chargebacks, net
 *   4. Calling the Ledger Service to post the settlement entry
 *   5. Generating bank file (NACHA/SWIFT format)
 *   6. Recording reconciliation data
 *
 * A settlement batch answers the question:
 *   "How much do we owe merchant X for the period Y?"
 *
 * The actual bank transfer is handled out-of-band (wire/ACH)
 * but the journal entry records it in the ledger.
 */

export class SettlementError extends Error {
  constructor(message: string, public code: string, public httpStatus = 422) {
    super(message);
    this.name = "SettlementError";
  }
}

const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? "http://localhost:4001";

/**
 * Open a new settlement batch for a merchant and period.
 */
export async function openBatch(
  pool: Pool,
  input: {
    merchantId:   string;
    merchantCode: string;
    periodStart:  Date;
    periodEnd:    Date;
    currency:     string;
  },
): Promise<{ batchId: string; batchNumber: string }> {

  // Check for existing batch for this merchant/period
  const existing = await pool.query<{ id: string; batch_number: string }>(
    `SELECT id, batch_number FROM settlement_batches
     WHERE merchant_id = $1 AND period_start = $2 AND period_end = $3 AND currency = $4`,
    [input.merchantId, input.periodStart, input.periodEnd, input.currency],
  );

  if (existing.rows.length > 0) {
    return { batchId: existing.rows[0].id, batchNumber: existing.rows[0].batch_number };
  }

  const batchNumber = `STL-${input.merchantCode}-${formatDate(input.periodStart)}-${input.currency}`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO settlement_batches
       (batch_number, merchant_id, merchant_code, period_start, period_end, currency)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [batchNumber, input.merchantId, input.merchantCode, input.periodStart, input.periodEnd, input.currency],
  );

  return { batchId: result.rows[0].id, batchNumber };
}

/**
 * Add a completed transfer to a settlement batch.
 * Returns silently if the transfer is already in the batch (idempotent).
 */
export async function addTransferToBatch(
  pool:        Pool,
  batchId:     string,
  transferRef: string,
  amount:      string,
  feeAmount:   string,
  currency:    string,
  itemType:    "TRANSFER" | "CHARGEBACK" | "REVERSAL" | "FEE" | "ADJUSTMENT" = "TRANSFER",
): Promise<void> {

  await pool.query(
    `INSERT INTO settlement_items (batch_id, transfer_ref, item_type, amount, fee_amount, currency)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (batch_id, transfer_ref) DO NOTHING`,
    [batchId, transferRef, itemType, amount, feeAmount, currency],
  );

  // Recompute batch totals
  await pool.query(
    `UPDATE settlement_batches SET
       gross_amount = (SELECT COALESCE(SUM(amount), 0) FROM settlement_items WHERE batch_id = $1),
       total_fees   = (SELECT COALESCE(SUM(fee_amount), 0) FROM settlement_items WHERE batch_id = $1),
       item_count   = (SELECT COUNT(*) FROM settlement_items WHERE batch_id = $1),
       chargebacks  = (SELECT COALESCE(SUM(amount), 0) FROM settlement_items WHERE batch_id = $1 AND item_type = 'CHARGEBACK')
     WHERE id = $1`,
    [batchId],
  );
}

/**
 * Process a settlement batch:
 *   1. Lock the batch (PROCESSING state)
 *   2. Post the settlement journal entry to the Ledger
 *   3. Mark batch COMPLETED
 *   4. Generate the bank instruction file
 */
export async function processBatch(
  pool:    Pool,
  batchId: string,
): Promise<{
  batchNumber:    string;
  netAmount:      string;
  journalEntryRef: string;
  bankFileId:     string;
}> {

  const batch = await pool.query<{
    id:           string;
    batch_number: string;
    merchant_id:  string;
    merchant_code: string;
    currency:     string;
    gross_amount: string;
    total_fees:   string;
    chargebacks:  string;
    net_amount:   string;
    item_count:   number;
    status:       string;
  }>(
    "SELECT * FROM settlement_batches WHERE id = $1",
    [batchId],
  );

  if (batch.rows.length === 0) {
    throw new SettlementError(`Batch not found: ${batchId}`, "BATCH_NOT_FOUND", 404);
  }

  const b = batch.rows[0];

  if (b.status !== "OPEN") {
    if (b.status === "COMPLETED" || b.status === "RECONCILED") {
      return {
        batchNumber:     b.batch_number,
        netAmount:       b.net_amount,
        journalEntryRef: "", // already processed
        bankFileId:      "",
      };
    }
    throw new SettlementError(`Cannot process batch in status: ${b.status}`, "INVALID_STATUS");
  }

  if (b.item_count === 0) {
    throw new SettlementError("Batch has no items to settle", "EMPTY_BATCH");
  }

  // Transition to PROCESSING
  await pool.query(
    "UPDATE settlement_batches SET status = 'PROCESSING', processing_started = NOW() WHERE id = $1",
    [batchId],
  );

  try {
    // ── Post to Ledger ─────────────────────────────────────
    const netAmount       = new Decimal(b.net_amount);
    const grossAmount     = new Decimal(b.gross_amount);
    const feeAmount       = new Decimal(b.total_fees);
    const chargebackAmt   = new Decimal(b.chargebacks);

    const merchantAccountCode  = `MERCHANT:${b.merchant_code}:${b.currency}`;
    const settlementAccount    = `SETTLEMENT-CLEARING:${b.currency}`;
    const feeRevenueAccount    = `FEE-SETTLEMENT:${b.currency}`;
    const chargebackAccount    = `CHARGEBACK-RESERVE:${b.currency}`;

    // Build journal lines: debit settlement clearing, credit merchant (net)
    const lines: Array<{ accountId: string; debit: string; credit: string }> = [
      // Settlement clearing debited for gross amount
      { accountId: settlementAccount,   debit: grossAmount.toString(), credit: "0" },
      // Merchant credited net (after fees and chargebacks)
      { accountId: merchantAccountCode, debit: "0", credit: netAmount.toString() },
    ];

    if (feeAmount.gt(0)) {
      lines.push({ accountId: feeRevenueAccount, debit: "0", credit: feeAmount.toString() });
    }
    if (chargebackAmt.gt(0)) {
      lines.push({ accountId: chargebackAccount, debit: "0", credit: chargebackAmt.toString() });
    }

    // Call Ledger Service
    const journalRef = `JE-STL-${b.batch_number}`;
    const ledgerRes = await fetch(`${LEDGER_URL}/entries`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        reference:   journalRef,
        entryType:   "SETTLEMENT",
        description: `Settlement batch ${b.batch_number} — ${b.item_count} items`,
        source:      "SETTLEMENT",
        postedBy:    "settlement-service",
        lines,
      }),
    });

    const ledgerResult = await ledgerRes.json() as {
      success: boolean;
      data?: { reference: string };
      error?: { code: string; message: string };
    };

    if (!ledgerResult.success) {
      throw new SettlementError(
        `Ledger posting failed: ${ledgerResult.error?.message}`,
        ledgerResult.error?.code ?? "LEDGER_ERROR",
        500,
      );
    }

    const journalEntryRef = ledgerResult.data!.reference;

    // ── Generate bank file ─────────────────────────────────
    const items = await pool.query(
      "SELECT * FROM settlement_items WHERE batch_id = $1 ORDER BY created_at ASC",
      [batchId],
    );

    const bankFileContent = generateNachaFile({
      batchNumber:  b.batch_number,
      merchantId:   b.merchant_id,
      merchantCode: b.merchant_code,
      netAmount,
      currency:     b.currency,
      items:        items.rows,
    });

    const fileHash = createHash("sha256").update(bankFileContent).digest("hex");

    const bankFileResult = await pool.query<{ id: string }>(
      `INSERT INTO bank_file_exports
         (batch_id, file_format, file_content, file_hash, line_count, total_amount)
       VALUES ($1, 'NACHA', $2, $3, $4, $5)
       RETURNING id`,
      [
        batchId,
        bankFileContent,
        fileHash,
        bankFileContent.split("\n").length,
        netAmount.toString(),
      ],
    );

    const bankFileId = bankFileResult.rows[0].id;

    // ── Mark batch COMPLETED ───────────────────────────────
    await pool.query(
      `UPDATE settlement_batches SET
         status            = 'COMPLETED',
         journal_entry_ref = $1,
         completed_at      = NOW()
       WHERE id = $2`,
      [journalEntryRef, batchId],
    );

    return {
      batchNumber:     b.batch_number,
      netAmount:       netAmount.toString(),
      journalEntryRef,
      bankFileId,
    };

  } catch (err) {
    // Roll back to OPEN so it can be retried
    await pool.query(
      "UPDATE settlement_batches SET status = 'OPEN', processing_started = NULL WHERE id = $1",
      [batchId],
    );
    throw err;
  }
}

/**
 * Get a batch with its items and reconciliation records.
 */
export async function getBatch(pool: Pool, batchId: string) {
  const [batch, items, recon] = await Promise.all([
    pool.query("SELECT * FROM settlement_batches WHERE id = $1", [batchId]),
    pool.query("SELECT * FROM settlement_items WHERE batch_id = $1 ORDER BY created_at ASC", [batchId]),
    pool.query("SELECT * FROM reconciliation_records WHERE batch_id = $1", [batchId]),
  ]);

  if (batch.rows.length === 0) {
    throw new SettlementError(`Batch not found: ${batchId}`, "BATCH_NOT_FOUND", 404);
  }

  return {
    batch:           batch.rows[0],
    items:           items.rows,
    reconciliations: recon.rows,
  };
}

/**
 * List settlement batches with pagination.
 */
export async function listBatches(
  pool: Pool,
  filters: {
    merchantId?: string;
    status?:     string;
    currency?:   string;
    page:        number;
    pageSize:    number;
  },
) {
  const conditions: string[] = [];
  const params:     unknown[] = [];

  if (filters.merchantId) { params.push(filters.merchantId); conditions.push(`merchant_id = $${params.length}`); }
  if (filters.status)     { params.push(filters.status);     conditions.push(`status = $${params.length}`); }
  if (filters.currency)   { params.push(filters.currency);   conditions.push(`currency = $${params.length}`); }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT * FROM settlement_batches ${where} ORDER BY period_start DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, filters.pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*) FROM settlement_batches ${where}`, params),
  ]);

  return {
    data:     rows.rows,
    total:    parseInt(count.rows[0].count, 10),
    page:     filters.page,
    pageSize: filters.pageSize,
  };
}

/**
 * Create a reconciliation record — match internal vs external amount.
 */
export async function createReconciliationRecord(
  pool: Pool,
  input: {
    batchId?:       string;
    source:         string;
    reference:      string;
    expectedAmount: string;
    actualAmount:   string;
    currency:       string;
  },
) {
  const expected = new Decimal(input.expectedAmount);
  const actual   = new Decimal(input.actualAmount);
  const status   = expected.equals(actual) ? "MATCHED" : "MISMATCHED";

  const result = await pool.query<{ id: string; difference: string }>(
    `INSERT INTO reconciliation_records
       (batch_id, source, reference, expected_amount, actual_amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, difference::text`,
    [input.batchId ?? null, input.source, input.reference, expected.toString(), actual.toString(), input.currency, status],
  );

  return result.rows[0];
}

/**
 * Resolve a mismatched reconciliation record.
 */
export async function resolveReconciliation(
  pool:        Pool,
  recordId:    string,
  resolvedBy:  string,
  notes?:      string,
): Promise<void> {
  await pool.query(
    `UPDATE reconciliation_records
     SET status = 'RESOLVED', resolved_by = $1, resolved_at = NOW(), notes = $2
     WHERE id = $3`,
    [resolvedBy, notes ?? null, recordId],
  );
}

// ── Private helpers ─────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

function generateNachaFile(input: {
  batchNumber:  string;
  merchantId:   string;
  merchantCode: string;
  netAmount:    Decimal;
  currency:     string;
  items:        Array<{ transfer_ref: string; net_amount: string }>;
}): string {
  /**
   * Simplified NACHA ACH file format.
   * Real production NACHA files require:
   *   - Bank routing/account numbers
   *   - Company IDs registered with your bank
   *   - Addenda records for reference information
   *   - Proper padding to exactly 94 chars per record
   *   - Block fill to multiples of 10 records
   *
   * This generates a representative structure for review.
   * A real implementation uses a NACHA library.
   */
  const fileDate = new Date().toISOString().split("T")[0].replace(/-/g, "").slice(2);
  const fileTime = new Date().toISOString().split("T")[1].slice(0, 5).replace(":", "");

  const lines: string[] = [];

  // File Header Record (Type 1)
  lines.push([
    "1",                          // Record Type
    "01",                         // Priority Code
    " 000000000",                 // Immediate Destination (bank routing - placeholder)
    "0000000000",                 // Immediate Origin (company ID - placeholder)
    fileDate,                     // File Creation Date
    fileTime,                     // File Creation Time
    "A",                          // File ID Modifier
    "094",                        // Record Size
    "10",                         // Blocking Factor
    "1",                          // Format Code
    "PRIMESTACK SWITCH   ",       // Immediate Destination Name
    "PRIMESTACK      ",           // Immediate Origin Name
    "        ",                   // Reference Code
  ].join(""));

  // Batch Header (Type 5)
  lines.push([
    "5",                          // Record Type
    "200",                        // Service Class Code (debits+credits)
    "PRIMESTACK      ",           // Company Name
    "          ",                 // Company Discretionary Data
    "0000000000",                 // Company ID (EIN - placeholder)
    "CCD",                        // Standard Entry Class Code
    input.batchNumber.slice(0, 10).padEnd(10), // Company Entry Description
    fileDate,                     // Company Descriptive Date
    fileDate,                     // Effective Entry Date
    "   ",                        // Settlement Date
    "1",                          // Originator Status Code
    "00000000",                   // Originating DFI ID (placeholder)
    "0000001",                    // Batch Number
  ].join(""));

  // Entry Detail Records (Type 6) — one per item
  let entrySeq = 1;
  for (const item of input.items) {
    const amount = Math.round(parseFloat(item.net_amount) * 100); // cents
    lines.push([
      "6",                        // Record Type
      "22",                       // Transaction Code (checking credit)
      "00000000",                 // Receiving DFI Routing (placeholder)
      "0",                        // Check Digit
      "000000000000000",          // DFI Account Number (placeholder)
      String(amount).padStart(10, "0"), // Amount in cents
      item.transfer_ref.slice(0, 15).padEnd(15), // Individual ID
      input.merchantCode.slice(0, 22).padEnd(22), // Individual Name
      "  ",                       // Discretionary Data
      "0",                        // Addenda Record Indicator
      "00000000",                 // Trace Number
      String(entrySeq).padStart(7, "0"),
    ].join(""));
    entrySeq++;
  }

  // Batch Control (Type 8)
  const totalAmount = Math.round(input.netAmount.times(100).toNumber());
  lines.push([
    "8",                          // Record Type
    "200",                        // Service Class Code
    String(input.items.length).padStart(6, "0"), // Entry/Addenda Count
    "000000000000",               // Entry Hash (placeholder)
    "000000000000",               // Total Debit
    String(totalAmount).padStart(12, "0"), // Total Credit
    "0000000000",                 // Company ID
    " ".repeat(39),               // Reserved
    "00000000",                   // Originating DFI
    "0000001",                    // Batch Number
  ].join(""));

  // File Control (Type 9)
  lines.push([
    "9",                          // Record Type
    "000001",                     // Batch Count
    String(Math.ceil((lines.length + 1) / 10)).padStart(6, "0"), // Block Count
    String(input.items.length).padStart(8, "0"), // Entry/Addenda Count
    "000000000000",               // Entry Hash
    "000000000000",               // Total Debit
    String(totalAmount).padStart(12, "0"), // Total Credit
    " ".repeat(39),               // Reserved
  ].join(""));

  return lines.join("\n");
}
