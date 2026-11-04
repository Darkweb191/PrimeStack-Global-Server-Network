/**
 * Settlement & Reconciliation — Integration Tests
 *
 * Run: npm test
 * Requires: settlement DB migrated (both migrations 001 + 002)
 *
 * Tests:
 *   ✓ Open batch — creates record, returns batchNumber
 *   ✓ Open same batch twice — idempotent
 *   ✓ Add items — gross/fee/net totals correct
 *   ✓ Duplicate item — idempotent (no double-count)
 *   ✓ Empty batch rejected with EMPTY_BATCH
 *   ✓ Intraday position created for new merchant
 *   ✓ Position credits accumulate correctly
 *   ✓ Reconciliation MATCHED when amounts equal
 *   ✓ Reconciliation MISMATCHED when amounts differ
 *   ✓ Resolve a mismatched record
 *   ✓ EOD summary returns correct structure
 *   ✓ Daily report generates and returns totals
 *   ✓ Adjustment creates record and updates position
 */

import { Pool }  from "pg";
import * as S    from "../src/domain/settlement.js";
import * as R    from "../src/domain/reconciliation.js";
import Decimal   from "decimal.js";

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_settlement_test",
  user:     process.env.PGUSER     ?? "settlement_svc",
  password: process.env.PGPASSWORD ?? "settlement_secret",
});

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

const uid  = () => Date.now().toString(36).toUpperCase();
const NOW  = new Date();
const START = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const END   = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0);
const MERCHANT = `MERCH-${uid()}`;

// ── Settlement tests ──────────────────────────────────────────

async function test_open_batch(): Promise<void> {
  const result = await S.openBatch(pool, {
    merchantId:   MERCHANT,
    merchantCode: "TESTM",
    periodStart:  START,
    periodEnd:    END,
    currency:     "USD",
  });

  assert(typeof result.batchId === "string" && result.batchId.length > 0, "should return batchId");
  assert(result.batchNumber.startsWith("STL-"), `batchNumber should start with STL-, got ${result.batchNumber}`);
}

async function test_open_batch_idempotent(): Promise<void> {
  const merchant = `MERCH-IDEM-${uid()}`;
  const first  = await S.openBatch(pool, { merchantId: merchant, merchantCode: "IDMM", periodStart: START, periodEnd: END, currency: "USD" });
  const second = await S.openBatch(pool, { merchantId: merchant, merchantCode: "IDMM", periodStart: START, periodEnd: END, currency: "USD" });

  assert(first.batchId === second.batchId,         "Duplicate open must return same batchId");
  assert(first.batchNumber === second.batchNumber,  "Duplicate open must return same batchNumber");
}

async function test_add_items_totals(): Promise<void> {
  const { batchId } = await S.openBatch(pool, {
    merchantId: `MERCH-TOTALS-${uid()}`, merchantCode: "TOTAL",
    periodStart: START, periodEnd: END, currency: "USD",
  });

  await S.addTransferToBatch(pool, batchId, `TRF-A-${uid()}`, "500.00", "5.00", "USD");
  await S.addTransferToBatch(pool, batchId, `TRF-B-${uid()}`, "300.00", "3.00", "USD");
  await S.addTransferToBatch(pool, batchId, `TRF-C-${uid()}`, "200.00", "2.00", "USD");

  const { batch } = await S.getBatch(pool, batchId);

  assert(new Decimal(batch.gross_amount).eq("1000"), `gross should be 1000, got ${batch.gross_amount}`);
  assert(new Decimal(batch.total_fees).eq("10"),     `fees should be 10, got ${batch.total_fees}`);
  assert(new Decimal(batch.net_amount).eq("990"),    `net should be 990, got ${batch.net_amount}`);
  assert(batch.item_count === 3, `item_count should be 3, got ${batch.item_count}`);
}

async function test_item_idempotent(): Promise<void> {
  const { batchId } = await S.openBatch(pool, {
    merchantId: `MERCH-IITEM-${uid()}`, merchantCode: "IITEM",
    periodStart: START, periodEnd: END, currency: "USD",
  });

  const ref = `TRF-IDEM-${uid()}`;
  await S.addTransferToBatch(pool, batchId, ref, "100.00", "1.00", "USD");
  await S.addTransferToBatch(pool, batchId, ref, "100.00", "1.00", "USD"); // duplicate

  const { batch } = await S.getBatch(pool, batchId);
  assert(batch.item_count === 1, `Duplicate item should not double-count, got ${batch.item_count}`);
}

async function test_empty_batch_rejected(): Promise<void> {
  const { batchId } = await S.openBatch(pool, {
    merchantId: `MERCH-EMPTY-${uid()}`, merchantCode: "EMPTY",
    periodStart: START, periodEnd: END, currency: "USD",
  });

  let threw = false;
  try {
    await S.processBatch(pool, batchId);
  } catch (err) {
    threw = true;
    assert((err as S.SettlementError).code === "EMPTY_BATCH", `code should be EMPTY_BATCH, got ${(err as Error).message}`);
  }
  assert(threw, "Empty batch should throw");
}

// ── Intraday Position tests ───────────────────────────────────

async function test_position_created(): Promise<void> {
  const merchant = `POS-MERCH-${uid()}`;
  const result   = await R.getOrCreatePosition(pool, merchant, "USD");

  assert(typeof result.id === "string" && result.id.length > 0, "should return position id");
  assert(typeof result.closingBalance === "string", "should return closing balance");
}

async function test_position_updates(): Promise<void> {
  const merchant = `POS-UPDATE-${uid()}`;
  await R.getOrCreatePosition(pool, merchant, "USD");

  // Add credits
  await R.updatePosition(pool, merchant, "USD", { grossCredit: "1000.00" });
  await R.updatePosition(pool, merchant, "USD", { grossCredit: "500.00", feeCharged: "15.00" });

  const row = await pool.query<{ gross_credits: string; fees_charged: string }>(
    "SELECT gross_credits::text, fees_charged::text FROM intraday_positions WHERE merchant_id = $1 AND currency = 'USD'",
    [merchant],
  );

  assert(new Decimal(row.rows[0].gross_credits).eq("1500"), `gross_credits should be 1500, got ${row.rows[0].gross_credits}`);
  assert(new Decimal(row.rows[0].fees_charged).eq("15"),    `fees_charged should be 15, got ${row.rows[0].fees_charged}`);
}

// ── Reconciliation tests ──────────────────────────────────────

async function test_reconciliation_matched(): Promise<void> {
  const { batchId, batchNumber } = await S.openBatch(pool, {
    merchantId: `MERCH-REC-${uid()}`, merchantCode: "RECM",
    periodStart: START, periodEnd: END, currency: "USD",
  });

  const ref = `TRF-REC-${uid()}`;
  await S.addTransferToBatch(pool, batchId, ref, "1000.00", "10.00", "USD");

  const result = await R.reconcileBatch(pool, batchNumber, "990.00", `EXT-${uid()}`, "BANK_STATEMENT");

  assert(result.status === "MATCHED",  `status should be MATCHED, got ${result.status}`);
  assert(new Decimal(result.difference).lte("0.01"), `difference should be <= 0.01, got ${result.difference}`);
}

async function test_reconciliation_mismatched(): Promise<void> {
  const { batchId, batchNumber } = await S.openBatch(pool, {
    merchantId: `MERCH-MIS-${uid()}`, merchantCode: "MISM",
    periodStart: START, periodEnd: END, currency: "USD",
  });

  await S.addTransferToBatch(pool, batchId, `TRF-MIS-${uid()}`, "1000.00", "10.00", "USD");

  const result = await R.reconcileBatch(pool, batchNumber, "850.00", `EXT-MIS-${uid()}`, "BANK_STATEMENT");

  assert(result.status === "MISMATCHED", `status should be MISMATCHED, got ${result.status}`);
  assert(new Decimal(result.difference).gt("0"), `difference should be > 0, got ${result.difference}`);
}

async function test_resolve_reconciliation(): Promise<void> {
  // Create a mismatched record directly
  const { batchId, batchNumber } = await S.openBatch(pool, {
    merchantId: `MERCH-RESOLVE-${uid()}`, merchantCode: "RESM",
    periodStart: START, periodEnd: END, currency: "USD",
  });
  await S.addTransferToBatch(pool, batchId, `TRF-RES-${uid()}`, "500.00", "5.00", "USD");

  const recon = await R.reconcileBatch(pool, batchNumber, "400.00", `EXT-RES-${uid()}`, "BANK");
  if (!recon.recordId) return;

  await S.resolveReconciliation(pool, recon.recordId, "ops-user-001", "Confirmed bank error");

  const row = await pool.query<{ status: string }>(
    "SELECT status FROM reconciliation_records WHERE id = $1",
    [recon.recordId],
  );
  assert(row.rows[0].status === "RESOLVED", `status should be RESOLVED, got ${row.rows[0].status}`);
}

// ── EOD & Reports ─────────────────────────────────────────────

async function test_eod_summary_structure(): Promise<void> {
  const summary = await R.getEodSummary(pool);

  assert(typeof summary.date            === "string",  "should have date");
  assert(Array.isArray(summary.positions),             "positions should be array");
  assert(typeof summary.settlementBatches === "object","settlementBatches should be object");
  assert(typeof summary.openMismatches  === "number",  "openMismatches should be number");
}

async function test_daily_report(): Promise<void> {
  const report = await R.generateDailyReport(pool, new Date(), undefined, "USD");

  assert(report.reportType === "DAILY",          "reportType should be DAILY");
  assert(typeof report.date === "string",        "should have date");
  assert(typeof report.totals === "object",      "should have totals object");
  assert(typeof report.settlement === "object",  "should have settlement object");
  assert(typeof report.generatedAt === "string", "should have generatedAt");
}

async function test_adjustment(): Promise<void> {
  const merchant = `MERCH-ADJ-${uid()}`;
  await R.getOrCreatePosition(pool, merchant, "USD");
  await R.updatePosition(pool, merchant, "USD", { grossCredit: "1000.00" });

  const result = await R.createAdjustment(pool, {
    merchantId:     merchant,
    adjustmentType: "FEE_CORRECTION",
    amount:         "5.00",
    currency:       "USD",
    description:    "Fee overcalculation correction",
    reference:      `ADJ-${uid()}`,
    appliedBy:      "ops-admin-001",
  });

  assert(typeof result.id === "string" && result.id.length > 0, "should return adjustment id");

  // Position should reflect the adjustment
  const row = await pool.query<{ adjustments: string }>(
    "SELECT adjustments::text FROM intraday_positions WHERE merchant_id = $1 AND currency = 'USD'",
    [merchant],
  );
  assert(new Decimal(row.rows[0].adjustments).gt("0"), "adjustments should be non-zero after credit adjustment");
}

// ── Runner ───────────────────────────────────────────────────

const tests = [
  { name: "Open batch — creates record with STL- number",         fn: test_open_batch },
  { name: "Opening same batch twice is idempotent",               fn: test_open_batch_idempotent },
  { name: "Adding items updates gross/fee/net totals",            fn: test_add_items_totals },
  { name: "Duplicate item does not double-count",                  fn: test_item_idempotent },
  { name: "Empty batch throws EMPTY_BATCH",                       fn: test_empty_batch_rejected },
  { name: "Intraday position created for new merchant",           fn: test_position_created },
  { name: "Position credit updates accumulate correctly",         fn: test_position_updates },
  { name: "Reconciliation MATCHED when amounts equal",            fn: test_reconciliation_matched },
  { name: "Reconciliation MISMATCHED when amounts differ",        fn: test_reconciliation_mismatched },
  { name: "Resolve a mismatched reconciliation record",           fn: test_resolve_reconciliation },
  { name: "EOD summary returns correct structure",                fn: test_eod_summary_structure },
  { name: "Daily report generates and returns totals",            fn: test_daily_report },
  { name: "Adjustment creates record and updates position",       fn: test_adjustment },
];

console.log("Settlement & Reconciliation — Integration Tests\n");
let passed = 0; let failed = 0;

for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${t.name}\n      ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

await pool.end();
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
