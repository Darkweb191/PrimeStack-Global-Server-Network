import { Pool }    from "pg";
import { Decimal } from "decimal.js";

/**
 * Settlement Engine — Phase 6 Core
 *
 * This is where transactions become final money movements.
 *
 * Net Settlement principle:
 *   Instead of settling TX1(+100), TX2(+50), TX3(-20), TX4(+30) separately,
 *   we compute the net position: +160 and settle once.
 *   This reduces bank wire volume by 90%+ for high-transaction merchants.
 *
 * Settlement Accounts:
 *   Every participant has a settlement account tracking their position.
 *   When we settle, we debit one account and credit another — always
 *   via the Ledger Service (never directly).
 *
 * EOD Process (runs at 23:59 or configured cutoff):
 *   1. FREEZE  — mark business date closed, no more queue entries
 *   2. BATCH   — group queue items by participant
 *   3. NET     — compute net position per participant
 *   4. SETTLE  — post journal entries, update settlement accounts
 *   5. RECON   — compare internal records vs external
 *   6. REPORT  — generate daily business report
 *   7. OPEN    — create next business day
 */

const LEDGER_URL = process.env.LEDGER_SERVICE_URL ?? "http://localhost:4001";

export class SettlementEngineError extends Error {
  constructor(message: string, public code: string, public httpStatus = 422) {
    super(message);
    this.name = "SettlementEngineError";
  }
}

// ── Settlement Accounts ──────────────────────────────────────

export async function createSettlementAccount(pool: Pool, input: {
  participantCode:  string;
  participantType:  string;
  currency:         string;
  overdraftLimit?:  string;
  dailyDebitLimit?: string;
  ledgerAccountCode?: string;
}): Promise<{ id: string }> {

  const result = await pool.query<{ id: string }>(
    `INSERT INTO settlement_accounts
       (participant_code, participant_type, account_currency, overdraft_limit, daily_debit_limit, ledger_account_code)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (participant_code) DO UPDATE SET
       participant_type   = EXCLUDED.participant_type,
       overdraft_limit    = COALESCE(EXCLUDED.overdraft_limit, settlement_accounts.overdraft_limit),
       ledger_account_code = COALESCE(EXCLUDED.ledger_account_code, settlement_accounts.ledger_account_code)
     RETURNING id`,
    [
      input.participantCode,
      input.participantType,
      input.currency,
      input.overdraftLimit   ?? "0",
      input.dailyDebitLimit  ?? null,
      input.ledgerAccountCode ?? null,
    ],
  );
  return { id: result.rows[0].id };
}

export async function getSettlementAccount(pool: Pool, participantCode: string) {
  const result = await pool.query(
    "SELECT * FROM settlement_accounts WHERE participant_code = $1",
    [participantCode],
  );
  if (!result.rows.length) throw new SettlementEngineError(`Account not found: ${participantCode}`, "ACCOUNT_NOT_FOUND", 404);
  return result.rows[0];
}

export async function listSettlementAccounts(pool: Pool, type?: string) {
  const where  = type ? "WHERE participant_type = $1" : "";
  const params = type ? [type] : [];
  return pool.query(`SELECT * FROM settlement_accounts ${where} ORDER BY participant_code`, params);
}

// ── Settlement Queue ─────────────────────────────────────────

/**
 * Enqueue a transaction for settlement.
 * Called by the switch-core immediately after approval.
 */
export async function enqueue(pool: Pool, input: {
  reference:    string;
  sourceCode:   string;
  destCode:     string;
  amount:       string;
  feeAmount?:   string;
  currency:     string;
  txType?:      string;
  businessDate?: Date;
}): Promise<void> {
  const date = (input.businessDate ?? new Date()).toISOString().split("T")[0];

  await pool.query(
    `INSERT INTO settlement_queue
       (reference, source_code, dest_code, amount, fee_amount, currency, tx_type, business_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (reference) DO NOTHING`,
    [
      input.reference, input.sourceCode, input.destCode,
      input.amount, input.feeAmount ?? "0",
      input.currency, input.txType ?? null, date,
    ],
  );
}

export async function getQueueStats(pool: Pool, businessDate?: string) {
  const date = businessDate ?? new Date().toISOString().split("T")[0];
  return pool.query<{
    settlement_status: string; count: string; total_amount: string;
  }>(
    `SELECT settlement_status, COUNT(*) as count, SUM(amount)::text as total_amount
     FROM settlement_queue WHERE business_date = $1
     GROUP BY settlement_status ORDER BY settlement_status`,
    [date],
  );
}

// ── Net Settlement ────────────────────────────────────────────

/**
 * Calculate net positions for all participants for a business date.
 * This is the core of net settlement:
 *   - Sum all credits and debits per participant
 *   - The net amount is what actually moves
 *   - High volume merchants see 90%+ reduction in wire count
 */
export async function calculateNetPositions(
  pool:         Pool,
  businessDate: string,
): Promise<Array<{
  participantCode: string;
  netAmount:       string;
  grossCredits:    string;
  grossDebits:     string;
  txCount:         number;
  currency:        string;
}>> {

  // Get all pending queue items for this date
  const items = await pool.query<{
    source_code:  string;
    dest_code:    string;
    amount:       string;
    fee_amount:   string;
    currency:     string;
  }>(
    `SELECT source_code, dest_code, amount::text, fee_amount::text, currency
     FROM settlement_queue
     WHERE business_date = $1 AND settlement_status = 'PENDING'`,
    [businessDate],
  );

  // Aggregate by participant
  const positions = new Map<string, { credits: Decimal; debits: Decimal; fees: Decimal; count: number; currency: string }>();

  for (const item of items.rows) {
    const amount = new Decimal(item.amount);
    const fee    = new Decimal(item.fee_amount);

    // Source: debit
    if (!positions.has(item.source_code)) {
      positions.set(item.source_code, { credits: new Decimal(0), debits: new Decimal(0), fees: new Decimal(0), count: 0, currency: item.currency });
    }
    const src = positions.get(item.source_code)!;
    src.debits = src.debits.plus(amount);
    src.fees   = src.fees.plus(fee);
    src.count++;

    // Destination: credit (net of fee)
    if (!positions.has(item.dest_code)) {
      positions.set(item.dest_code, { credits: new Decimal(0), debits: new Decimal(0), fees: new Decimal(0), count: 0, currency: item.currency });
    }
    const dst = positions.get(item.dest_code)!;
    dst.credits = dst.credits.plus(amount.minus(fee));
    dst.count++;
  }

  // Upsert net_positions records
  const results = [];

  for (const [participantCode, pos] of positions.entries()) {
    const netAmount = pos.credits.minus(pos.debits).minus(pos.fees);

    // Get or create participant account
    const account = await pool.query<{ id: string }>(
      "SELECT id FROM settlement_accounts WHERE participant_code = $1",
      [participantCode],
    );

    if (!account.rows.length) {
      // Auto-create account for unknown participants
      await createSettlementAccount(pool, {
        participantCode,
        participantType: "MERCHANT",
        currency: pos.currency,
      });
    }

    const acctId = account.rows[0]?.id ?? (await pool.query<{ id: string }>(
      "SELECT id FROM settlement_accounts WHERE participant_code = $1",
      [participantCode],
    )).rows[0].id;

    await pool.query(
      `INSERT INTO net_positions
         (participant_id, participant_code, business_date, currency,
          gross_credits, gross_debits, fees, tx_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CALCULATED')
       ON CONFLICT (participant_id, business_date, currency) DO UPDATE SET
         gross_credits = EXCLUDED.gross_credits,
         gross_debits  = EXCLUDED.gross_debits,
         fees          = EXCLUDED.fees,
         tx_count      = EXCLUDED.tx_count,
         status        = 'CALCULATED',
         calculated_at = NOW()`,
      [acctId, participantCode, businessDate, pos.currency, pos.credits.toString(), pos.debits.toString(), pos.fees.toString(), pos.count],
    );

    results.push({
      participantCode,
      netAmount:    netAmount.toString(),
      grossCredits: pos.credits.toString(),
      grossDebits:  pos.debits.toString(),
      txCount:      pos.count,
      currency:     pos.currency,
    });
  }

  return results;
}

/**
 * Process net settlement for a business date.
 * Posts journal entries for each participant's net position.
 */
export async function processNetSettlement(
  pool:         Pool,
  businessDate: string,
): Promise<{ processed: number; totalVolume: string; batchId: string }> {

  const positions = await pool.query<{
    id: string; participant_code: string; net_amount: string;
    gross_credits: string; gross_debits: string; currency: string; tx_count: number;
  }>(
    `SELECT * FROM net_positions
     WHERE business_date = $1 AND status = 'CALCULATED'
     ORDER BY net_amount DESC`,
    [businessDate],
  );

  if (!positions.rows.length) {
    throw new SettlementEngineError(`No calculated positions for ${businessDate}`, "NO_POSITIONS");
  }

  const batchNumber = `NET-STL-${businessDate.replace(/-/g, "")}`;

  // Create settlement batch for this net run
  const batchResult = await pool.query<{ id: string }>(
    `INSERT INTO settlement_batches
       (batch_number, merchant_id, merchant_code, period_start, period_end,
        currency, status, is_eod_batch, settlement_date, settlement_type)
     VALUES ($1, 'SYSTEM', 'NET_SETTLEMENT', $2, $2, 'USD', 'PROCESSING', TRUE, $2, 'NET')
     ON CONFLICT (batch_number) DO UPDATE SET status = 'PROCESSING'
     RETURNING id`,
    [batchNumber, businessDate],
  );

  const batchId = batchResult.rows[0].id;

  let totalVolume = new Decimal(0);
  let processed   = 0;

  for (const pos of positions.rows) {
    try {
      const netAmount = new Decimal(pos.net_amount);
      if (netAmount.isZero()) {
        await pool.query(
          "UPDATE net_positions SET status = 'SETTLED', settled_at = NOW(), batch_id = $1 WHERE id = $2",
          [batchId, pos.id],
        );
        continue;
      }

      // Post journal entry: net positive = credit merchant, debit clearing
      const jeRef   = `NET-${pos.participant_code}-${businessDate}`;
      const clearing = `NET-CLEARING:${pos.currency}`;
      const merchant = pos.participant_code;

      const lines = netAmount.gt(0)
        ? [
            { accountId: clearing, debit: netAmount.abs().toString(), credit: "0" },
            { accountId: merchant, debit: "0",   credit: netAmount.abs().toString() },
          ]
        : [
            { accountId: merchant, debit: netAmount.abs().toString(), credit: "0" },
            { accountId: clearing, debit: "0",   credit: netAmount.abs().toString() },
          ];

      await callLedger(jeRef, "SETTLEMENT",
        `Net settlement ${pos.participant_code} ${businessDate}: ${pos.tx_count} tx, net ${netAmount.toString()}`,
        lines);

      // Update settlement account available balance
      await pool.query(
        `UPDATE settlement_accounts
         SET available_balance = available_balance + $1, updated_at = NOW()
         WHERE participant_code = $2`,
        [netAmount.toString(), pos.participant_code],
      );

      // Mark queue items as SETTLED
      await pool.query(
        `UPDATE settlement_queue
         SET settlement_status = 'SETTLED', batch_id = $1, settled_at = NOW()
         WHERE business_date = $2
           AND (source_code = $3 OR dest_code = $3)
           AND settlement_status = 'PENDING'`,
        [batchId, businessDate, pos.participant_code],
      );

      // Mark net position as SETTLED
      await pool.query(
        `UPDATE net_positions
         SET status = 'SETTLED', batch_id = $1, journal_entry_ref = $2, settled_at = NOW()
         WHERE id = $3`,
        [batchId, jeRef, pos.id],
      );

      totalVolume = totalVolume.plus(netAmount.abs());
      processed++;

    } catch (err) {
      console.error(`[settlement-engine] net settlement failed for ${pos.participant_code}:`, err);
      await pool.query(
        "UPDATE net_positions SET status = 'FAILED' WHERE id = $1",
        [pos.id],
      );
    }
  }

  // Complete the batch
  await pool.query(
    `UPDATE settlement_batches
     SET status = 'COMPLETED', completed_at = NOW(),
         total_amount = $1, participant_count = $2
     WHERE id = $3`,
    [totalVolume.toString(), processed, batchId],
  );

  return { processed, totalVolume: totalVolume.toString(), batchId };
}

// ── Reversals ─────────────────────────────────────────────────

export async function initiateReversal(pool: Pool, input: {
  originalTx:    string;
  originalAmount: string;
  currency:      string;
  reasonCode?:   string;
  reasonDesc?:   string;
  initiatedBy?:  string;
}): Promise<{ id: string; reversalRef: string }> {

  // Check for existing reversal
  const existing = await pool.query(
    "SELECT id, reversal_ref FROM reversals WHERE original_tx = $1 AND status NOT IN ('FAILED','REJECTED')",
    [input.originalTx],
  );
  if (existing.rows.length > 0) {
    throw new SettlementEngineError(`Reversal already exists for ${input.originalTx}`, "DUPLICATE_REVERSAL", 409);
  }

  const reversalRef = `REV-${input.originalTx}`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO reversals
       (reversal_ref, original_tx, original_amount, currency, reason_code, reason_desc, initiated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [reversalRef, input.originalTx, input.originalAmount, input.currency, input.reasonCode ?? null, input.reasonDesc ?? null, input.initiatedBy ?? null],
  );

  return { id: result.rows[0].id, reversalRef };
}

export async function completeReversal(
  pool:             Pool,
  reversalId:       string,
  journalEntryRef:  string,
  approvedBy?:      string,
): Promise<void> {
  await pool.query(
    `UPDATE reversals SET
       status = 'COMPLETED', journal_entry_ref = $1, approved_by = $2,
       completed_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [journalEntryRef, approvedBy ?? null, reversalId],
  );
}

export async function listReversals(pool: Pool, status?: string, page = 1, pageSize = 50) {
  const where  = status ? "WHERE status = $1" : "";
  const params = status ? [status] : [];
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM reversals ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, offset]),
    pool.query(`SELECT COUNT(*) FROM reversals ${where}`, params),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── Chargebacks ───────────────────────────────────────────────

export async function fileChargeback(pool: Pool, input: {
  transactionRef: string;
  merchantId:     string;
  amount:         string;
  currency:       string;
  reasonCode?:    string;
  reasonDesc?:    string;
  networkRef?:    string;
  responseDeadline?: Date;
}): Promise<{ id: string; caseNumber: string }> {

  const seq = await pool.query<{ nextval: string }>("SELECT NEXTVAL('chargeback_seq')");
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const caseNumber = `CB-${date}-${seq.rows[0].nextval.toString().padStart(6, "0")}`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO chargebacks
       (case_number, transaction_ref, merchant_id, amount, currency,
        reason_code, reason_desc, network_ref, response_deadline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      caseNumber, input.transactionRef, input.merchantId,
      input.amount, input.currency,
      input.reasonCode  ?? null,
      input.reasonDesc  ?? null,
      input.networkRef  ?? null,
      input.responseDeadline ?? new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45-day default
    ],
  );

  // Post provisional chargeback journal entry
  const jeRef          = `CB-${caseNumber}`;
  const merchantAcct   = `MERCHANT:${input.merchantId}:${input.currency}`;
  const cbReserve      = `CHARGEBACK-RESERVE:${input.currency}`;

  try {
    await callLedger(jeRef, "CHARGEBACK",
      `Chargeback filed: ${caseNumber} for tx ${input.transactionRef}`,
      [
        { accountId: merchantAcct, debit: input.amount, credit: "0" },  // debit merchant
        { accountId: cbReserve,    debit: "0",   credit: input.amount }, // credit reserve
      ],
    );

    await pool.query(
      "UPDATE chargebacks SET journal_entry_ref = $1 WHERE id = $2",
      [jeRef, result.rows[0].id],
    );
  } catch (err) {
    console.error(`[chargeback] ledger post failed for ${caseNumber}:`, err);
  }

  return { id: result.rows[0].id, caseNumber };
}

export async function updateChargeback(pool: Pool, caseNumber: string, input: {
  status?:          string;
  merchantResponse?: string;
  decisionNotes?:   string;
  assignedTo?:      string;
  evidence?:        Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `UPDATE chargebacks SET
       status            = COALESCE($1, status),
       merchant_response = COALESCE($2, merchant_response),
       decision_notes    = COALESCE($3, decision_notes),
       assigned_to       = COALESCE($4::uuid, assigned_to),
       evidence          = COALESCE($5::jsonb, evidence),
       responded_at      = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE responded_at END,
       resolved_at       = CASE WHEN $1 IN ('WON','LOST','CLOSED') THEN NOW() ELSE resolved_at END,
       updated_at        = NOW()
     WHERE case_number = $6`,
    [input.status ?? null, input.merchantResponse ?? null, input.decisionNotes ?? null, input.assignedTo ?? null, input.evidence ? JSON.stringify(input.evidence) : null, caseNumber],
  );
}

export async function listChargebacks(pool: Pool, status?: string, merchantId?: string, page = 1, pageSize = 50) {
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (status)     { params.push(status);     conditions.push(`status = $${params.length}`); }
  if (merchantId) { params.push(merchantId); conditions.push(`merchant_id = $${params.length}`); }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const [rows, count] = await Promise.all([
    pool.query(`SELECT * FROM chargebacks ${where} ORDER BY filed_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, pageSize, offset]),
    pool.query(`SELECT COUNT(*) FROM chargebacks ${where}`, params),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

// ── Reconciliation Engine ─────────────────────────────────────

/**
 * Reconcile switch records against an external source.
 * Compares amounts and flags mismatches for investigation.
 */
export async function runReconciliation(
  pool:         Pool,
  businessDate: string,
  externalRecords: Array<{
    reference:      string;
    amount:         string;
    currency:       string;
    participantCode?: string;
    source:         string;
  }>,
): Promise<{
  matched:   number;
  mismatch:  number;
  missing:   number;
  exceptions: number;
}> {

  let matched = 0, mismatch = 0, missing = 0, exceptions = 0;

  for (const ext of externalRecords) {
    // Find the corresponding switch record
    const switchRecord = await pool.query<{ amount: string; currency: string }>(
      `SELECT amount::text, currency FROM settlement_queue
       WHERE reference = $1 AND business_date = $2`,
      [ext.reference, businessDate],
    );

    let status: string;
    let exceptionType: string | null = null;
    let exceptionReason: string | null = null;

    if (!switchRecord.rows.length) {
      status          = "MISSING";
      exceptionType   = "MISSING_RECORD";
      exceptionReason = `Reference ${ext.reference} not found in switch records`;
      missing++;
    } else {
      const switchAmt = new Decimal(switchRecord.rows[0].amount);
      const extAmt    = new Decimal(ext.amount);
      const diff      = switchAmt.minus(extAmt).abs();

      if (diff.lte("0.01")) {
        status  = "MATCHED";
        matched++;
      } else {
        status          = "MISMATCH";
        exceptionType   = "AMOUNT_MISMATCH";
        exceptionReason = `Switch: ${switchAmt}, External: ${extAmt}, Diff: ${diff}`;
        mismatch++;
      }
    }

    // Insert recon record
    const recon = await pool.query<{ id: string }>(
      `INSERT INTO recon_records
         (business_date, source, reference, participant_code,
          switch_amount, settlement_amount, currency, recon_status, exception_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (source, reference, business_date) DO UPDATE SET
         recon_status     = EXCLUDED.recon_status,
         settlement_amount = EXCLUDED.settlement_amount,
         exception_reason = EXCLUDED.exception_reason
       RETURNING id`,
      [
        businessDate, ext.source, ext.reference, ext.participantCode ?? null,
        switchRecord.rows[0]?.amount ?? null, ext.amount,
        ext.currency, status, exceptionReason,
      ],
    );

    // Create exception if needed
    if (exceptionType && recon.rows[0]) {
      await pool.query(
        `INSERT INTO reconciliation_exceptions
           (recon_id, transaction_ref, exception_type, exception_reason, switch_amount, external_amount)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [recon.rows[0].id, ext.reference, exceptionType, exceptionReason,
         switchRecord.rows[0]?.amount ?? null, ext.amount],
      );
      exceptions++;
    }
  }

  return { matched, mismatch, missing, exceptions };
}

export async function listExceptions(pool: Pool, status = "OPEN", page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT e.*, r.business_date, r.source FROM reconciliation_exceptions e
       JOIN recon_records r ON r.id = e.recon_id
       WHERE e.status = $1
       ORDER BY e.created_at DESC LIMIT $2 OFFSET $3`,
      [status, pageSize, offset],
    ),
    pool.query("SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = $1", [status]),
  ]);
  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

export async function resolveException(pool: Pool, exceptionId: string, resolution: string, resolvedBy: string): Promise<void> {
  await pool.query(
    `UPDATE reconciliation_exceptions SET status = 'RESOLVED', resolution = $1, assigned_to = $2, updated_at = NOW() WHERE id = $3`,
    [resolution, resolvedBy, exceptionId],
  );
  // Also resolve the parent recon_record if all exceptions are resolved
  const exc = await pool.query<{ recon_id: string }>("SELECT recon_id FROM reconciliation_exceptions WHERE id = $1", [exceptionId]);
  if (exc.rows.length > 0) {
    const openCount = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*) as cnt FROM reconciliation_exceptions WHERE recon_id = $1 AND status != 'RESOLVED'",
      [exc.rows[0].recon_id],
    );
    if (parseInt(openCount.rows[0].cnt, 10) === 0) {
      await pool.query("UPDATE recon_records SET recon_status = 'MATCHED', resolved_at = NOW(), resolved_by = $1 WHERE id = $2", [resolvedBy, exc.rows[0].recon_id]);
    }
  }
}

// ── EOD Processing ────────────────────────────────────────────

/**
 * Run full End-of-Day settlement cycle.
 *
 * Steps (with state tracking for resume-on-failure):
 *   FREEZING    → mark business date closed
 *   BATCHING    → group queue items into batches
 *   NETTING     → calculate net positions per participant
 *   RECONCILING → compare with expected records
 *   REPORTING   → generate daily business report
 *   COMPLETED   → done
 */
export async function runEod(
  pool:         Pool,
  businessDate: string,
  runBy?:       string,
): Promise<{ batchId: string; participantsSettled: number; totalVolume: string }> {

  // Prevent duplicate EOD runs
  const existing = await pool.query<{ status: string; id: string }>(
    "SELECT id, status FROM eod_runs WHERE business_date = $1",
    [businessDate],
  );

  if (existing.rows.length > 0 && existing.rows[0].status === "COMPLETED") {
    throw new SettlementEngineError(`EOD already completed for ${businessDate}`, "EOD_ALREADY_RUN", 409);
  }

  // Create or resume EOD run record
  const run = await pool.query<{ id: string }>(
    `INSERT INTO eod_runs (business_date, status, run_by)
     VALUES ($1, 'INITIATED', $2)
     ON CONFLICT (business_date) DO UPDATE SET status = 'INITIATED', run_by = $2
     RETURNING id`,
    [businessDate, runBy ?? "system"],
  );
  const runId = run.rows[0].id;

  const updateStep = async (status: string, stepResult: Record<string, unknown>) => {
    await pool.query(
      `UPDATE eod_runs SET status = $1, step_results = COALESCE(step_results, '{}') || $2::jsonb WHERE id = $3`,
      [status, JSON.stringify(stepResult), runId],
    );
  };

  try {
    // ── STEP 1: FREEZE ────────────────────────────────────────
    await updateStep("FREEZING", { freezeStart: new Date().toISOString() });

    // Mark all pending queue items older than businessDate as excluded
    const freezeResult = await pool.query(
      `UPDATE settlement_queue SET settlement_status = 'EXCLUDED'
       WHERE business_date < $1 AND settlement_status = 'PENDING'`,
      [businessDate],
    );
    await updateStep("BATCHING", { excluded: freezeResult.rowCount, batchStart: new Date().toISOString() });

    // ── STEP 2: NET ───────────────────────────────────────────
    await updateStep("NETTING", { nettingStart: new Date().toISOString() });
    const netPositions = await calculateNetPositions(pool, businessDate);
    await updateStep("NETTING", { positionCount: netPositions.length });

    // ── STEP 3: SETTLE ────────────────────────────────────────
    const settlementResult = await processNetSettlement(pool, businessDate);
    await updateStep("RECONCILING", {
      batchId:    settlementResult.batchId,
      processed:  settlementResult.processed,
      volume:     settlementResult.totalVolume,
    });

    // ── STEP 4: REPORT ────────────────────────────────────────
    await updateStep("REPORTING", { reportStart: new Date().toISOString() });
    const report = await generateBusinessReport(pool, businessDate);
    await updateStep("REPORTING", { reportGenerated: true });

    // ── DONE ──────────────────────────────────────────────────
    await pool.query(
      "UPDATE eod_runs SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1",
      [runId],
    );

    return {
      batchId:            settlementResult.batchId,
      participantsSettled: settlementResult.processed,
      totalVolume:        settlementResult.totalVolume,
    };

  } catch (err) {
    await pool.query(
      "UPDATE eod_runs SET status = 'FAILED', error_message = $1 WHERE id = $2",
      [(err instanceof Error ? err.message : String(err)), runId],
    );
    throw err;
  }
}

// ── Business Reports ──────────────────────────────────────────

export async function generateBusinessReport(
  pool:         Pool,
  businessDate: string,
  currency      = "USD",
): Promise<Record<string, unknown>> {

  const [queueStats, cbStats, revStats, acctStats] = await Promise.all([
    pool.query<{ settlement_status: string; count: string; total_amount: string }>(
      `SELECT settlement_status, COUNT(*) as count, SUM(amount)::text as total_amount
       FROM settlement_queue WHERE business_date = $1 AND currency = $2
       GROUP BY settlement_status`,
      [businessDate, currency],
    ),
    pool.query<{ count: string; total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount),0)::text as total
       FROM chargebacks WHERE DATE(filed_at) = $1 AND currency = $2`,
      [businessDate, currency],
    ),
    pool.query<{ count: string; total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(original_amount),0)::text as total
       FROM reversals WHERE DATE(initiated_at) = $1 AND currency = $2`,
      [businessDate, currency],
    ),
    pool.query(
      `SELECT COUNT(*) as participants, SUM(ABS(net_amount))::text as settled_volume
       FROM net_positions WHERE business_date = $1 AND currency = $2 AND status = 'SETTLED'`,
      [businessDate, currency],
    ),
  ]);

  const byStatus: Record<string, number> = {};
  let totalTx = 0;
  let totalVol = new Decimal(0);
  let settledVol = new Decimal(0);

  for (const row of queueStats.rows) {
    const count = parseInt(row.count, 10);
    byStatus[row.settlement_status] = count;
    totalTx  += count;
    totalVol  = totalVol.plus(row.total_amount);
    if (row.settlement_status === "SETTLED") settledVol = settledVol.plus(row.total_amount);
  }

  const report = {
    reportDate:   businessDate,
    currency,
    transactions: {
      total:    totalTx,
      settled:  byStatus.SETTLED  ?? 0,
      pending:  byStatus.PENDING  ?? 0,
      failed:   byStatus.FAILED   ?? 0,
      excluded: byStatus.EXCLUDED ?? 0,
    },
    volume:          totalVol.toString(),
    settlementVolume: settledVol.toString(),
    chargebacks: {
      count:  parseInt(cbStats.rows[0]?.count  ?? "0", 10),
      amount: cbStats.rows[0]?.total ?? "0",
    },
    reversals: {
      count:  parseInt(revStats.rows[0]?.count ?? "0", 10),
      amount: revStats.rows[0]?.total ?? "0",
    },
    netSettlement: {
      participants:    parseInt(acctStats.rows[0]?.participants  ?? "0", 10),
      settledVolume:   acctStats.rows[0]?.settled_volume ?? "0",
    },
    generatedAt: new Date().toISOString(),
  };

  // Persist
  await pool.query(
    `INSERT INTO business_reports
       (report_date, report_type, total_transactions, approved_count, total_volume,
        settlement_volume, chargeback_count, reversal_count, currency, report_data)
     VALUES ($1,'DAILY',$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (report_date, report_type, currency) DO UPDATE SET
       total_transactions = EXCLUDED.total_transactions,
       total_volume       = EXCLUDED.total_volume,
       settlement_volume  = EXCLUDED.settlement_volume,
       report_data        = EXCLUDED.report_data,
       generated_at       = NOW()`,
    [
      businessDate, totalTx, byStatus.SETTLED ?? 0,
      totalVol.toString(), settledVol.toString(),
      parseInt(cbStats.rows[0]?.count  ?? "0", 10),
      parseInt(revStats.rows[0]?.count ?? "0", 10),
      currency, JSON.stringify(report),
    ],
  );

  return report;
}

// ── Treasury Dashboard ────────────────────────────────────────

export async function getTreasuryDashboard(pool: Pool): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];

  const [accounts, queueStats, openReversals, openCb, openExceptions, netPositions, lastBatch] = await Promise.all([
    pool.query("SELECT participant_type, COUNT(*) as count, SUM(available_balance)::text as total_balance FROM settlement_accounts WHERE status = 'ACTIVE' GROUP BY participant_type"),
    getQueueStats(pool, today),
    pool.query<{ count: string }>("SELECT COUNT(*) as count FROM reversals WHERE status IN ('PENDING','PROCESSING')"),
    pool.query<{ count: string; amount: string }>("SELECT COUNT(*) as count, COALESCE(SUM(amount),0)::text as amount FROM chargebacks WHERE status IN ('OPEN','REPRESENTMENT')"),
    pool.query<{ count: string }>("SELECT COUNT(*) as count FROM reconciliation_exceptions WHERE status IN ('OPEN','INVESTIGATING')"),
    pool.query(`SELECT participant_code, net_amount::text, status FROM net_positions WHERE business_date = $1`, [today]),
    pool.query("SELECT * FROM eod_runs ORDER BY business_date DESC LIMIT 1"),
  ]);

  return {
    settlementAccounts:  accounts.rows,
    queueStats:          queueStats.rows,
    openReversals:       parseInt(openReversals.rows[0]?.count ?? "0", 10),
    openChargebacks: {
      count:  parseInt(openCb.rows[0]?.count ?? "0", 10),
      amount: openCb.rows[0]?.amount ?? "0",
    },
    openExceptions:      parseInt(openExceptions.rows[0]?.count ?? "0", 10),
    todayNetPositions:   netPositions.rows,
    lastEod:             lastBatch.rows[0] ?? null,
  };
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
    body:    JSON.stringify({ reference, entryType, description, source: "SETTLEMENT_ENGINE", postedBy: "settlement-service", lines }),
    signal:  AbortSignal.timeout(15_000),
  });

  const data = await res.json() as { success: boolean; error?: { code: string; message: string } };
  if (!data.success && data.error?.code !== "DUPLICATE_ENTRY") {
    throw new SettlementEngineError(`Ledger error: ${data.error?.message ?? "unknown"}`, "LEDGER_ERROR", 500);
  }
}
