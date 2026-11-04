/**
 * Ledger Service — Test Suite
 *
 * These tests run against a REAL PostgreSQL database (test schema).
 * They are not unit tests — they are integration tests.
 * The ledger's guarantees can only be verified against a real DB.
 *
 * Run: npm test
 * Requires: PostgreSQL running, test DB created (see setup below)
 *
 * Test coverage:
 *   ✓ Happy path: balanced entry posts correctly
 *   ✓ Balances update correctly (ASSET and LIABILITY accounts)
 *   ✓ Unbalanced entry is rejected
 *   ✓ Zero-value entry is rejected
 *   ✓ Insufficient funds prevents the entry
 *   ✓ Frozen account prevents the entry
 *   ✓ Duplicate reference is idempotent (no double-posting)
 *   ✓ Reversal creates a mirror entry and restores balances
 *   ✓ Double-reversal is rejected
 *   ✓ Fund hold reduces available balance
 *   ✓ Hold release restores available balance
 *   ✓ Concurrent transfers serialize correctly (no lost updates)
 */

import { Pool }             from "pg";
import { randomUUID }       from "crypto";
import {
  postEntry,
  reverseEntry,
  holdFunds,
  releaseHold,
  getBalance,
  LedgerError,
}                           from "../src/domain/ledger.js";

// ── Test database setup ─────────────────────────────────────

const TEST_DB = {
  host:     process.env.PGHOST     ?? "localhost",
  port:     parseInt(process.env.PGPORT ?? "5432", 10),
  database: process.env.PGDATABASE ?? "primestack_ledger_test",
  user:     process.env.PGUSER     ?? "ledger_svc",
  password: process.env.PGPASSWORD ?? "ledger_secret",
};

let pool: Pool;
let ASSET_ACCOUNT_ID:     string;
let REVENUE_ACCOUNT_ID:   string;
let LIABILITY_ACCOUNT_ID: string;

// Simple assertion helpers
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function runTests(): Promise<void> {
  pool = new Pool(TEST_DB);

  // ── Setup ─────────────────────────────────────────────────
  await setup();

  const results: Array<{ name: string; passed: boolean; error?: string }> = [];

  const tests: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "balanced entry posts and updates balances",          fn: test_balanced_entry },
    { name: "LIABILITY account credits increase balance",         fn: test_liability_balance },
    { name: "unbalanced entry is rejected",                       fn: test_unbalanced_rejected },
    { name: "zero-value entry is rejected",                       fn: test_zero_rejected },
    { name: "insufficient funds is rejected",                     fn: test_insufficient_funds },
    { name: "frozen account prevents debit",                      fn: test_frozen_account },
    { name: "duplicate reference is idempotent",                  fn: test_idempotent },
    { name: "reversal creates mirror entry and restores balance",  fn: test_reversal },
    { name: "double reversal is rejected",                        fn: test_double_reversal },
    { name: "hold reduces available balance",                     fn: test_hold },
    { name: "hold release restores available balance",            fn: test_release },
    { name: "concurrent transfers serialize correctly",           fn: test_concurrency },
  ];

  for (const test of tests) {
    // Reset balances before each test
    await resetBalances();

    try {
      await test.fn();
      results.push({ name: test.name, passed: true });
      console.log(`  ✓ ${test.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: test.name, passed: false, error: message });
      console.log(`  ✗ ${test.name}\n      ${message}`);
    }
  }

  // ── Teardown ──────────────────────────────────────────────
  await pool.end();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n  ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

// ── Setup helpers ────────────────────────────────────────────

async function setup(): Promise<void> {
  // Create test accounts
  ASSET_ACCOUNT_ID = randomUUID();
  REVENUE_ACCOUNT_ID = randomUUID();
  LIABILITY_ACCOUNT_ID = randomUUID();

  const accounts = [
    [ASSET_ACCOUNT_ID,     "TEST-ASSET-001",     "ASSET",     "USD", "Test Asset Account"],
    [REVENUE_ACCOUNT_ID,   "TEST-REVENUE-001",   "REVENUE",   "USD", "Test Revenue Account"],
    [LIABILITY_ACCOUNT_ID, "TEST-LIABILITY-001", "LIABILITY", "USD", "Test Liability Account"],
  ];

  for (const [id, num, type, currency, name] of accounts) {
    await pool.query(
      `INSERT INTO accounts (id, account_number, account_type, currency, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_number) DO UPDATE SET id = $1`,
      [id, num, type, currency, name],
    );
    await pool.query(
      `INSERT INTO account_balances (account_id, available_balance)
       VALUES ($1, 10000)
       ON CONFLICT (account_id) DO UPDATE SET available_balance = 10000, held_balance = 0`,
      [id],
    );
  }
}

async function resetBalances(): Promise<void> {
  await pool.query(
    `UPDATE account_balances
     SET available_balance = 10000, held_balance = 0
     WHERE account_id = ANY($1)`,
    [[ASSET_ACCOUNT_ID, REVENUE_ACCOUNT_ID, LIABILITY_ACCOUNT_ID]],
  );
  // Clear any holds
  await pool.query(
    `UPDATE fund_holds SET status = 'RELEASED', released_at = NOW()
     WHERE account_id = ANY($1) AND status = 'ACTIVE'`,
    [[ASSET_ACCOUNT_ID, REVENUE_ACCOUNT_ID, LIABILITY_ACCOUNT_ID]],
  );
}

function ref(): string {
  return `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Tests ────────────────────────────────────────────────────

async function test_balanced_entry(): Promise<void> {
  const r = ref();
  const before = await getBalance(pool, ASSET_ACCOUNT_ID);

  const result = await postEntry(pool, {
    reference:   r,
    entryType:   "TRANSFER",
    description: "Test transfer",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,   debit: "100", credit: "0" },   // debit asset (decreases)
      { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "100" }, // credit revenue (increases)
    ],
  });

  assert(typeof result.entryId === "string", "should return entryId");
  assert(result.reference === r, "should return reference");

  // ASSET: debit decreases available balance
  const after = await getBalance(pool, ASSET_ACCOUNT_ID);
  const delta  = parseFloat(before.availableBalance) - parseFloat(after.availableBalance);
  assert(Math.abs(delta - 100) < 0.001, `asset balance should decrease by 100, got ${delta}`);
}

async function test_liability_balance(): Promise<void> {
  const before = await getBalance(pool, LIABILITY_ACCOUNT_ID);

  await postEntry(pool, {
    reference:   ref(),
    entryType:   "TRANSFER",
    description: "Liability credit",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,     debit: "50", credit: "0" },
      { accountId: LIABILITY_ACCOUNT_ID, debit: "0",  credit: "50" }, // credit increases liability
    ],
  });

  const after = await getBalance(pool, LIABILITY_ACCOUNT_ID);
  const delta  = parseFloat(after.availableBalance) - parseFloat(before.availableBalance);
  assert(Math.abs(delta - 50) < 0.001, `liability balance should increase by 50, got ${delta}`);
}

async function test_unbalanced_rejected(): Promise<void> {
  let threw = false;
  try {
    await postEntry(pool, {
      reference:   ref(),
      entryType:   "TRANSFER",
      description: "Unbalanced",
      lines: [
        { accountId: ASSET_ACCOUNT_ID,   debit: "100", credit: "0" },
        { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "90" }, // 100 != 90
      ],
    });
  } catch (err) {
    threw = true;
    assert(err instanceof LedgerError, "should throw LedgerError");
    assert((err as LedgerError).code === "UNBALANCED_ENTRY", "code should be UNBALANCED_ENTRY");
  }
  assert(threw, "should have thrown");
}

async function test_zero_rejected(): Promise<void> {
  let threw = false;
  try {
    await postEntry(pool, {
      reference:   ref(),
      entryType:   "TRANSFER",
      description: "Zero entry",
      lines: [
        { accountId: ASSET_ACCOUNT_ID,   debit: "0", credit: "0" },
        { accountId: REVENUE_ACCOUNT_ID, debit: "0", credit: "0" },
      ],
    });
  } catch (err) {
    threw = true;
    assert((err as LedgerError).code === "ZERO_ENTRY", "code should be ZERO_ENTRY");
  }
  assert(threw, "should have thrown");
}

async function test_insufficient_funds(): Promise<void> {
  let threw = false;
  try {
    await postEntry(pool, {
      reference:   ref(),
      entryType:   "TRANSFER",
      description: "Too big",
      lines: [
        { accountId: ASSET_ACCOUNT_ID,   debit: "99999", credit: "0" },     // more than 10000
        { accountId: REVENUE_ACCOUNT_ID, debit: "0",     credit: "99999" },
      ],
    });
  } catch (err) {
    threw = true;
    assert((err as LedgerError).code === "INSUFFICIENT_FUNDS", "code should be INSUFFICIENT_FUNDS");
  }
  assert(threw, "should have thrown for insufficient funds");
}

async function test_frozen_account(): Promise<void> {
  // Freeze the asset account
  await pool.query(
    "UPDATE accounts SET status = 'FROZEN' WHERE id = $1",
    [ASSET_ACCOUNT_ID],
  );

  let threw = false;
  try {
    await postEntry(pool, {
      reference:   ref(),
      entryType:   "TRANSFER",
      description: "Debit frozen account",
      lines: [
        { accountId: ASSET_ACCOUNT_ID,   debit: "100", credit: "0" },
        { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "100" },
      ],
    });
  } catch (err) {
    threw = true;
    assert((err as LedgerError).code === "ACCOUNT_NOT_ACTIVE", "code should be ACCOUNT_NOT_ACTIVE");
  } finally {
    // Restore
    await pool.query("UPDATE accounts SET status = 'ACTIVE' WHERE id = $1", [ASSET_ACCOUNT_ID]);
  }

  assert(threw, "should have thrown for frozen account");
}

async function test_idempotent(): Promise<void> {
  const r = ref();

  const first  = await postEntry(pool, {
    reference: r, entryType: "TRANSFER", description: "Idempotency test",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,   debit: "50", credit: "0" },
      { accountId: REVENUE_ACCOUNT_ID, debit: "0",  credit: "50" },
    ],
  });

  const second = await postEntry(pool, {
    reference: r, entryType: "TRANSFER", description: "Idempotency test",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,   debit: "50", credit: "0" },
      { accountId: REVENUE_ACCOUNT_ID, debit: "0",  credit: "50" },
    ],
  });

  // Same entry returned, balance only changed once
  assert(first.entryId === second.entryId, "should return same entryId on duplicate reference");

  const balance = await getBalance(pool, ASSET_ACCOUNT_ID);
  const delta = 10000 - parseFloat(balance.availableBalance);
  assert(Math.abs(delta - 50) < 0.001, "balance should only change once despite two calls");
}

async function test_reversal(): Promise<void> {
  const r = ref();

  await postEntry(pool, {
    reference: r, entryType: "TRANSFER", description: "To be reversed",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,   debit: "200", credit: "0" },
      { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "200" },
    ],
  });

  const balAfterPost = await getBalance(pool, ASSET_ACCOUNT_ID);
  assert(Math.abs(parseFloat(balAfterPost.availableBalance) - 9800) < 0.001, "balance after post should be 9800");

  await reverseEntry(pool, r, "Test reversal");

  const balAfterRev = await getBalance(pool, ASSET_ACCOUNT_ID);
  assert(Math.abs(parseFloat(balAfterRev.availableBalance) - 10000) < 0.001, "balance should be restored after reversal");
}

async function test_double_reversal(): Promise<void> {
  const r = ref();

  await postEntry(pool, {
    reference: r, entryType: "TRANSFER", description: "Double reversal test",
    lines: [
      { accountId: ASSET_ACCOUNT_ID,   debit: "100", credit: "0" },
      { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "100" },
    ],
  });

  await reverseEntry(pool, r, "First reversal");

  let threw = false;
  try {
    await reverseEntry(pool, r, "Second reversal");
  } catch (err) {
    threw = true;
    assert((err as LedgerError).code === "ALREADY_REVERSED", "code should be ALREADY_REVERSED");
  }
  assert(threw, "should have thrown on double reversal");
}

async function test_hold(): Promise<void> {
  const holdRef = ref();
  const before = await getBalance(pool, ASSET_ACCOUNT_ID);

  await holdFunds(pool, {
    accountId:   ASSET_ACCOUNT_ID,
    amount:      "300",
    reference:   holdRef,
    description: "Test hold",
  });

  const after = await getBalance(pool, ASSET_ACCOUNT_ID);

  // available_balance unchanged, held_balance increased, effectiveBalance decreased
  assert(
    parseFloat(before.availableBalance) === parseFloat(after.availableBalance),
    "availableBalance should not change on hold",
  );
  assert(
    Math.abs(parseFloat(after.heldBalance) - 300) < 0.001,
    "heldBalance should be 300",
  );
  assert(
    Math.abs(parseFloat(after.effectiveBalance) - (parseFloat(after.availableBalance) - 300)) < 0.001,
    "effectiveBalance should be availableBalance - heldBalance",
  );
}

async function test_release(): Promise<void> {
  const holdRef = ref();

  await holdFunds(pool, {
    accountId:   ASSET_ACCOUNT_ID,
    amount:      "500",
    reference:   holdRef,
  });

  const afterHold = await getBalance(pool, ASSET_ACCOUNT_ID);
  assert(Math.abs(parseFloat(afterHold.heldBalance) - 500) < 0.001, "held should be 500");

  await releaseHold(pool, holdRef);

  const afterRelease = await getBalance(pool, ASSET_ACCOUNT_ID);
  assert(Math.abs(parseFloat(afterRelease.heldBalance)) < 0.001, "held should be 0 after release");
}

async function test_concurrency(): Promise<void> {
  // Fire 20 concurrent transfers of 100 each from ASSET → REVENUE
  // Total debit: 2000. Starting balance: 10000. Expected final: 8000.
  const transfers = Array.from({ length: 20 }, (_, i) =>
    postEntry(pool, {
      reference:   `CONC-${Date.now()}-${i}`,
      entryType:   "TRANSFER",
      description: `Concurrent transfer ${i}`,
      lines: [
        { accountId: ASSET_ACCOUNT_ID,   debit: "100", credit: "0" },
        { accountId: REVENUE_ACCOUNT_ID, debit: "0",   credit: "100" },
      ],
    }),
  );

  // All should resolve (succeed or fail with a typed error, never corrupt state)
  const results = await Promise.allSettled(transfers);
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed    = results.filter((r) => r.status === "rejected").length;

  console.log(`      (${succeeded} succeeded, ${failed} serialization failures)`);

  const finalBalance = await getBalance(pool, ASSET_ACCOUNT_ID);

  // Balance should be exactly 10000 - (succeeded * 100)
  const expectedBalance = 10000 - (succeeded * 100);
  const actualBalance   = parseFloat(finalBalance.availableBalance);

  assert(
    Math.abs(actualBalance - expectedBalance) < 0.001,
    `balance ${actualBalance} should be ${expectedBalance} (${succeeded} of 20 succeeded)`,
  );

  // Verify no balance went negative
  assert(actualBalance >= 0, "balance must never be negative");
}

// ── Runner ───────────────────────────────────────────────────

console.log("Ledger Service — Integration Tests\n");
runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
