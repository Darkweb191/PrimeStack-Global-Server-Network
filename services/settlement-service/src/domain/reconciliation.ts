import { Pool }    from "pg";
import { Decimal } from "decimal.js";
import { createHash } from "crypto";

/**
 * Reconciliation & Financial Reporting Domain
 *
 * Reconciliation verifies that:
 *   Internal records (what our switch says) == External records (what the bank/processor says)
 *
 * EOD (End-of-Day) Processing:
 *   1. Close all open intraday positions
 *   2. Compute closing balances
 *   3. Post EOD journal entries to ledger
 *   4. Generate EOD position snapshots
 *   5. Queue settlement batches for all pending merchants
 *
 * Reconciliation workflow:
 *   PENDING → compare internal vs external
 *     → MATCHED   (difference = 0)
 *     → MISMATCHED (difference > threshold)
 *       → ESCALATED (requires manual investigation)
 *       → RESOLVED  (adjuster closes with explanation)
 *
 * Financial reports are computed from EOD positions and
 * settlement batch history, not from raw transactions.
 */

const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? "http://localhost:4001";

export class ReconciliationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ReconciliationError";
  }
}

// ── Intraday Position Management ─────────────────────────────

/**
 * Get or create today's intraday position for a merchant+currency.
 */
export async function getOrCreatePosition(
  pool:       Pool,
  merchantId: string,
  currency:   string,
  date?:      Date,
): Promise<{ id: string; closingBalance: string }> {

  const d = date ?? new Date();
  const today = d.toISOString().split("T")[0];

  const existing = await pool.query<{ id: string; closing_balance: string }>(
    "SELECT id, closing_balance::text FROM intraday_positions WHERE merchant_id = $1 AND currency = $2 AND date = $3",
    [merchantId, currency, today],
  );

  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, closingBalance: existing.rows[0].closing_balance };
  }

  // Get yesterday's closing balance as today's opening
  const yesterday = new Date(d);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const prior = await pool.query<{ closing_balance: string }>(
    "SELECT closing_balance::text FROM eod_positions WHERE merchant_id = $1 AND currency = $2 AND position_date = $3",
    [merchantId, currency, yesterdayStr],
  );

  const openingBalance = prior.rows[0]?.closing_balance ?? "0";

  const result = await pool.query<{ id: string; closing_balance: string }>(
    `INSERT INTO intraday_positions (merchant_id, currency, date, opening_balance)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (merchant_id, currency, date) DO UPDATE
       SET updated_at = NOW()
     RETURNING id, closing_balance::text`,
    [merchantId, currency, today, openingBalance],
  );

  return { id: result.rows[0].id, closingBalance: result.rows[0].closing_balance };
}

/**
 * Update intraday position when a transaction is processed.
 * Called after every approved transaction and settlement item.
 */
export async function updatePosition(
  pool:       Pool,
  merchantId: string,
  currency:   string,
  updates: {
    grossCredit?:   string;
    grossDebit?:    string;
    feeCharged?:    string;
    chargeback?:    string;
    adjustment?:    string;
  },
): Promise<void> {

  await getOrCreatePosition(pool, merchantId, currency);

  const today = new Date().toISOString().split("T")[0];

  await pool.query(
    `UPDATE intraday_positions SET
       gross_credits = gross_credits + COALESCE($1::numeric, 0),
       gross_debits  = gross_debits  + COALESCE($2::numeric, 0),
       fees_charged  = fees_charged  + COALESCE($3::numeric, 0),
       chargebacks   = chargebacks   + COALESCE($4::numeric, 0),
       adjustments   = adjustments   + COALESCE($5::numeric, 0),
       updated_at    = NOW()
     WHERE merchant_id = $6 AND currency = $7 AND date = $8 AND is_closed = FALSE`,
    [
      updates.grossCredit  ?? null,
      updates.grossDebit   ?? null,
      updates.feeCharged   ?? null,
      updates.chargeback   ?? null,
      updates.adjustment   ?? null,
      merchantId, currency, today,
    ],
  );
}

// ── End-of-Day Processing ─────────────────────────────────────

/**
 * Run End-of-Day close for all open positions.
 * Should be called once daily at midnight (or configured time).
 *
 * Process:
 *   1. Find all open intraday positions
 *   2. Post EOD journal entries to ledger
 *   3. Snapshot into eod_positions (immutable)
 *   4. Mark intraday_positions as closed
 */
export async function runEndOfDay(pool: Pool, forDate?: Date): Promise<{
  processedMerchants: number;
  totalNetMovement:   string;
}> {

  const date = forDate ?? new Date();
  const dateStr = date.toISOString().split("T")[0];

  const openPositions = await pool.query<{
    id: string; merchant_id: string; currency: string;
    opening_balance: string; closing_balance: string;
    gross_credits: string; gross_debits: string;
    fees_charged: string; chargebacks: string;
    adjustments: string;
  }>(
    `SELECT * FROM intraday_positions WHERE date = $1 AND is_closed = FALSE`,
    [dateStr],
  );

  let totalNetMovement = new Decimal(0);
  let processedCount   = 0;

  for (const pos of openPositions.rows) {
    try {
      const opening = new Decimal(pos.opening_balance);
      const closing = new Decimal(pos.closing_balance);
      const netMove = closing.minus(opening);

      // Post EOD journal entry to ledger
      const eodRef = `EOD-${pos.merchant_id}-${dateStr}-${pos.currency}`;

      if (!netMove.isZero()) {
        const merchantAccount  = `MERCHANT:${pos.merchant_id}:${pos.currency}`;
        const eodClearingAcct  = `EOD-CLEARING:${pos.currency}`;

        const lines = netMove.gt(0)
          ? [
              // Net positive: credit the merchant account
              { accountId: eodClearingAcct,  debit: netMove.abs().toString(), credit: "0" },
              { accountId: merchantAccount,   debit: "0",   credit: netMove.abs().toString() },
            ]
          : [
              // Net negative: debit the merchant account
              { accountId: merchantAccount,   debit: netMove.abs().toString(), credit: "0" },
              { accountId: eodClearingAcct,  debit: "0",   credit: netMove.abs().toString() },
            ];

        await callLedger(eodRef, "SETTLEMENT", `EOD close for ${pos.merchant_id} on ${dateStr}`, lines);
      }

      // Snapshot to eod_positions (immutable)
      await pool.query(
        `INSERT INTO eod_positions
           (merchant_id, currency, position_date, opening_balance, closing_balance,
            net_movement, total_credits, total_debits, total_fees, total_chargebacks,
            journal_entry_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (merchant_id, currency, position_date) DO NOTHING`,
        [
          pos.merchant_id, pos.currency, dateStr,
          pos.opening_balance, pos.closing_balance,
          netMove.toString(),
          pos.gross_credits, pos.gross_debits,
          pos.fees_charged, pos.chargebacks,
          netMove.isZero() ? null : eodRef,
        ],
      );

      // Close the intraday position
      await pool.query(
        "UPDATE intraday_positions SET is_closed = TRUE, closed_at = NOW() WHERE id = $1",
        [pos.id],
      );

      totalNetMovement = totalNetMovement.plus(netMove);
      processedCount++;

    } catch (err) {
      console.error(`[reconciliation] EOD failed for ${pos.merchant_id}:`, err);
    }
  }

  return {
    processedMerchants: processedCount,
    totalNetMovement:   totalNetMovement.toString(),
  };
}

// ── Reconciliation ────────────────────────────────────────────

/**
 * Compare internal settlement batch amount against external bank record.
 * Returns MATCHED or MISMATCHED, with the difference amount.
 */
export async function reconcileBatch(
  pool:             Pool,
  batchNumber:      string,
  externalAmount:   string,
  externalRef:      string,
  source:           string,
): Promise<{
  status:          string;
  difference:      string;
  recordId:        string;
}> {

  const batch = await pool.query<{ id: string; net_amount: string; currency: string }>(
    "SELECT id, net_amount::text, currency FROM settlement_batches WHERE batch_number = $1",
    [batchNumber],
  );

  if (batch.rows.length === 0) {
    throw new ReconciliationError(`Batch not found: ${batchNumber}`, "BATCH_NOT_FOUND");
  }

  const internal = new Decimal(batch.rows[0].net_amount);
  const external  = new Decimal(externalAmount);
  const diff      = internal.minus(external).abs();

  // Within $0.01 tolerance → MATCHED
  const status = diff.lte("0.01") ? "MATCHED" : "MISMATCHED";

  const result = await pool.query<{ id: string }>(
    `INSERT INTO reconciliation_records
       (batch_id, source, reference, expected_amount, actual_amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [batch.rows[0].id, source, externalRef, internal.toString(), externalAmount, batch.rows[0].currency, status],
  );

  if (status === "MISMATCHED") {
    console.warn(
      `[reconciliation] MISMATCH batch=${batchNumber} internal=${internal} external=${externalAmount} diff=${diff}`,
    );
  }

  return {
    status,
    difference: diff.toString(),
    recordId:   result.rows[0]?.id ?? "",
  };
}

/**
 * List open reconciliation mismatches for investigation.
 */
export async function listMismatches(pool: Pool, page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT rr.*, sb.batch_number, sb.merchant_id
       FROM reconciliation_records rr
       LEFT JOIN settlement_batches sb ON sb.id = rr.batch_id
       WHERE rr.status IN ('MISMATCHED','ESCALATED')
       ORDER BY rr.created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    ),
    pool.query("SELECT COUNT(*) FROM reconciliation_records WHERE status IN ('MISMATCHED','ESCALATED')"),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── Financial Reports ─────────────────────────────────────────

/**
 * Generate a daily financial report for a merchant.
 */
export async function generateDailyReport(
  pool:       Pool,
  date:       Date,
  merchantId?: string,
  currency    = "USD",
): Promise<Record<string, unknown>> {

  const dateStr = date.toISOString().split("T")[0];

  // EOD position
  const posWhere = merchantId
    ? "WHERE merchant_id = $1 AND currency = $2 AND position_date = $3"
    : "WHERE currency = $1 AND position_date = $2";
  const posParams = merchantId ? [merchantId, currency, dateStr] : [currency, dateStr];

  const positions = await pool.query(
    `SELECT
       SUM(total_credits)      as total_credits,
       SUM(total_debits)       as total_debits,
       SUM(total_fees)         as total_fees,
       SUM(total_chargebacks)  as total_chargebacks,
       SUM(net_movement)       as net_movement,
       SUM(closing_balance)    as closing_balance,
       COUNT(*)                as merchant_count
     FROM eod_positions
     ${posWhere}`,
    posParams,
  );

  // Settlement batches
  const batchWhere = merchantId
    ? "WHERE merchant_id = $1 AND period_start::date = $2 AND status IN ('COMPLETED','RECONCILED')"
    : "WHERE period_start::date = $1 AND status IN ('COMPLETED','RECONCILED')";
  const batchParams = merchantId ? [merchantId, dateStr] : [dateStr];

  const batches = await pool.query(
    `SELECT COUNT(*) as batch_count, SUM(gross_amount) as gross, SUM(net_amount) as net
     FROM settlement_batches ${batchWhere}`,
    batchParams,
  );

  const pos = positions.rows[0];
  const bat = batches.rows[0];

  const report = {
    reportType:   "DAILY",
    date:         dateStr,
    merchantId:   merchantId ?? "ALL",
    currency,
    totals: {
      credits:      pos?.total_credits    ?? "0",
      debits:       pos?.total_debits     ?? "0",
      fees:         pos?.total_fees       ?? "0",
      chargebacks:  pos?.total_chargebacks ?? "0",
      netMovement:  pos?.net_movement     ?? "0",
      closingBalance: pos?.closing_balance ?? "0",
    },
    settlement: {
      batchCount:   parseInt(bat?.batch_count ?? "0", 10),
      grossAmount:  bat?.gross ?? "0",
      netAmount:    bat?.net   ?? "0",
    },
    generatedAt: new Date().toISOString(),
  };

  // Persist the report
  await pool.query(
    `INSERT INTO financial_reports
       (report_type, period_start, period_end, merchant_id, currency,
        total_volume, gross_revenue, net_payout, report_data)
     VALUES ('DAILY', $1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (report_type, period_start, merchant_id, currency) DO UPDATE
       SET report_data = EXCLUDED.report_data, generated_at = NOW()`,
    [
      dateStr,
      merchantId ?? null,
      currency,
      pos?.net_movement ?? "0",
      pos?.total_fees   ?? "0",
      bat?.net          ?? "0",
      JSON.stringify(report),
    ],
  );

  return report;
}

/**
 * Get the current EOD summary for all merchants.
 */
export async function getEodSummary(pool: Pool, date?: Date) {
  const dateStr = (date ?? new Date()).toISOString().split("T")[0];

  const [positions, batches, mismatches] = await Promise.all([
    pool.query(
      `SELECT merchant_id, currency, opening_balance, closing_balance,
              gross_credits, gross_debits, fees_charged, is_closed
       FROM intraday_positions WHERE date = $1 ORDER BY merchant_id`,
      [dateStr],
    ),
    pool.query(
      `SELECT COUNT(*) as total, SUM(net_amount) as total_net
       FROM settlement_batches WHERE period_start::date = $1`,
      [dateStr],
    ),
    pool.query(
      "SELECT COUNT(*) as open_mismatches FROM reconciliation_records WHERE status = 'MISMATCHED'",
    ),
  ]);

  return {
    date:           dateStr,
    positions:      positions.rows,
    settlementBatches: {
      count:    parseInt(batches.rows[0].total, 10),
      totalNet: batches.rows[0].total_net ?? "0",
    },
    openMismatches: parseInt(mismatches.rows[0].open_mismatches, 10),
  };
}

// ── Adjustments ───────────────────────────────────────────────

export async function createAdjustment(pool: Pool, input: {
  batchId?:        string;
  merchantId:      string;
  adjustmentType:  string;
  amount:          string;
  currency:        string;
  description:     string;
  reference:       string;
  appliedBy:       string;
}): Promise<{ id: string }> {

  const result = await pool.query<{ id: string }>(
    `INSERT INTO settlement_adjustments
       (batch_id, merchant_id, adjustment_type, amount, currency, description, reference, applied_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.batchId ?? null, input.merchantId, input.adjustmentType,
      input.amount, input.currency, input.description,
      input.reference, input.appliedBy,
    ],
  );

  // Update intraday position
  const isCredit = ["CHARGEBACK_CREDIT","MANUAL_CREDIT","REFUND"].includes(input.adjustmentType);
  await updatePosition(pool, input.merchantId, input.currency, {
    adjustment: isCredit ? input.amount : `-${input.amount}`,
  });

  return { id: result.rows[0].id };
}

// ── Private helpers ───────────────────────────────────────────

async function callLedger(
  reference:   string,
  entryType:   string,
  description: string,
  lines:       Array<{ accountId: string; debit: string; credit: string }>,
): Promise<void> {
  const res = await fetch(`${LEDGER_URL}/entries`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ reference, entryType, description, source: "RECONCILIATION", lines }),
    signal:  AbortSignal.timeout(15_000),
  });

  const data = await res.json() as { success: boolean; error?: { message: string } };
  if (!data.success) {
    throw new ReconciliationError(
      `Ledger error: ${data.error?.message ?? "unknown"}`,
      "LEDGER_ERROR",
    );
  }
}
