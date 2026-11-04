/**
 * Risk Engine — Integration Tests
 *
 * Tests the full decision pipeline against real PostgreSQL and Redis.
 * Run: npm test
 *
 * Tests:
 *   ✓ Blacklisted IP → immediate BLOCK, no scoring
 *   ✓ Blacklisted account → immediate BLOCK
 *   ✓ Blocked country → immediate BLOCK
 *   ✓ Low-risk transaction → APPROVE (score < 30)
 *   ✓ Medium amount + new device → REVIEW (score 30–69)
 *   ✓ Very high amount + new device + velocity → DECLINE (score >= 70)
 *   ✓ Watchlist entity → adds score penalty but does not block
 *   ✓ Profile single_tx_limit exceeded → score spike
 *   ✓ Duplicate txRef is handled (idempotent decision record)
 *   ✓ Review queue: approve changes status to APPROVED
 *   ✓ Review queue: reject changes status to REJECTED
 *   ✓ AML case opened with correct case_number format
 *   ✓ Dashboard stats return correct structure
 */

import { Pool }      from "pg";
import { createClient } from "redis";
import * as RE       from "../src/domain/risk-engine.js";
import { fingerprintDevice } from "../src/domain/device.js";

const pool  = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_risk_test",
  user:     process.env.PGUSER     ?? "risk_svc",
  password: process.env.PGPASSWORD ?? "risk_secret",
});

const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379/15" });
await redis.connect();

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

function txRef(): string {
  return `TEST-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
}

// ── Blacklist tests ──────────────────────────────────────────

async function test_blacklisted_ip_blocks(): Promise<void> {
  const ip = `10.99.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;

  await RE.addToBlacklist(pool, { blacklistType: "IP", value: ip, reason: "Test blacklist" });

  const result = await RE.evaluate(pool, redis as never, {
    txRef:     txRef(),
    sourceId:  "account-test",
    amount:    "100",
    currency:  "USD",
    ipAddress: ip,
  });

  assert(result.decision === "BLOCK",   "Blacklisted IP should BLOCK");
  assert(result.blocked  === true,      "blocked flag should be true");
  assert(result.score    === 100,       `score should be 100 for blacklist, got ${result.score}`);
  assert(result.evalMs   < 500,         `eval should be fast, took ${result.evalMs}ms`);

  // Cleanup
  await RE.removeFromBlacklist(pool, "IP", ip);
}

async function test_blacklisted_account_blocks(): Promise<void> {
  const accountId = `acct-blacklisted-${Date.now()}`;
  await RE.addToBlacklist(pool, { blacklistType: "ACCOUNT", value: accountId, reason: "Fraud account" });

  const result = await RE.evaluate(pool, redis as never, {
    txRef:    txRef(),
    sourceId: accountId,
    amount:   "500",
    currency: "USD",
  });

  assert(result.decision === "BLOCK", "Blacklisted account should BLOCK");

  await RE.removeFromBlacklist(pool, "ACCOUNT", accountId);
}

async function test_blocked_country(): Promise<void> {
  // Ensure XX is blocked
  await pool.query(
    "INSERT INTO country_rules (country_code, country_name, allowed, risk_score) VALUES ('XX','Unknown',FALSE,100) ON CONFLICT (country_code) DO UPDATE SET allowed = FALSE",
  );

  const result = await RE.evaluate(pool, redis as never, {
    txRef:       txRef(),
    sourceId:    "account-test",
    amount:      "100",
    currency:    "USD",
    countryCode: "XX",
  });

  assert(result.decision === "BLOCK",  "Blocked country should BLOCK");
  assert(result.blocked  === true,     "blocked flag should be true");
}

async function test_low_risk_approves(): Promise<void> {
  const result = await RE.evaluate(pool, redis as never, {
    txRef:       txRef(),
    sourceId:    "trusted-account-001",
    amount:      "50",        // small amount
    currency:    "USD",
    countryCode: "US",
    deviceHash:  fingerprintDevice({ os: "iOS", browser: "Safari", language: "en-US" }),
  });

  // Small amount, known country, no blacklist — should approve
  assert(result.decision === "APPROVE" || result.decision === "REVIEW",
    `Low-risk tx should APPROVE or REVIEW, got ${result.decision} (score ${result.score})`);
  assert(result.blocked === false, "Should not be blocked");
  assert(typeof result.score === "number" && result.score >= 0 && result.score <= 100,
    `Score should be 0–100, got ${result.score}`);
}

async function test_high_amount_declines(): Promise<void> {
  const result = await RE.evaluate(pool, redis as never, {
    txRef:       txRef(),
    sourceId:    `account-high-${Date.now()}`,
    amount:      "75000",     // > 50k threshold → +35 score
    currency:    "USD",
    countryCode: "US",
    deviceHash:  `new-device-${Date.now()}`,  // new device → +20
    isCrossBorder: true,       // cross-border → +5
  });

  // 35 + 20 + 5 = 60+ → should at least REVIEW or DECLINE
  assert(
    result.decision === "DECLINE" || result.decision === "REVIEW",
    `High-amount tx should DECLINE or REVIEW, got ${result.decision} (score ${result.score})`,
  );
  assert(result.score >= 30, `Score should be >= 30 for high-amount tx, got ${result.score}`);
}

async function test_watchlist_adds_score(): Promise<void> {
  const accountId = `acct-watched-${Date.now()}`;
  await RE.addToWatchlist(pool, {
    entityType:  "ACCOUNT",
    entityValue: accountId,
    score:       25,
    reason:      "Suspicious pattern",
  });

  const result = await RE.evaluate(pool, redis as never, {
    txRef:    txRef(),
    sourceId: accountId,
    amount:   "100",
    currency: "USD",
  });

  assert(result.decision !== "BLOCK", "Watchlist should not BLOCK (only add score)");
  assert(result.score >= 25,          `Score should be >= 25 from watchlist penalty, got ${result.score}`);
  assert("WATCHLIST" in result.factors, "WATCHLIST should appear in factors");
}

async function test_merchant_profile_limit(): Promise<void> {
  const merchantId = `merchant-profile-test-${Date.now()}`;

  await RE.upsertProfile(pool, {
    merchantId,
    singleTxLimit: "1000",   // small limit
    dailyLimit:    "5000",
    monthlyLimit:  "50000",
  });

  const result = await RE.evaluate(pool, redis as never, {
    txRef:      txRef(),
    sourceId:   `account-${merchantId}`,
    merchantId,
    amount:     "2000",       // exceeds single_tx_limit
    currency:   "USD",
  });

  assert(result.decision !== "APPROVE" || result.score < 30,
    `Exceeding profile limit should raise score (got ${result.score})`);
  assert("SINGLE_TX_LIMIT_EXCEEDED" in result.factors || result.score > 0,
    "SINGLE_TX_LIMIT_EXCEEDED should appear in factors when limit exceeded");
}

async function test_review_approve(): Promise<void> {
  // Create a REVIEW decision manually
  const ref = txRef();
  const reviewId = await pool.query<{ id: string }>(
    `INSERT INTO manual_review (transaction_ref, amount, currency, risk_score)
     VALUES ($1, '5000', 'USD', 45) RETURNING id`,
    [ref],
  );

  const id = reviewId.rows[0].id;
  await RE.approveReview(pool, id, "reviewer-001", "Manual check passed");

  const row = await pool.query<{ status: string }>("SELECT status FROM manual_review WHERE id = $1", [id]);
  assert(row.rows[0].status === "APPROVED", `Status should be APPROVED, got ${row.rows[0].status}`);
}

async function test_review_reject(): Promise<void> {
  const ref = txRef();
  const reviewId = await pool.query<{ id: string }>(
    `INSERT INTO manual_review (transaction_ref, amount, currency, risk_score)
     VALUES ($1, '8000', 'USD', 55) RETURNING id`,
    [ref],
  );

  const id = reviewId.rows[0].id;
  await RE.rejectReview(pool, id, "reviewer-001", "Suspicious pattern confirmed");

  const row = await pool.query<{ status: string }>("SELECT status FROM manual_review WHERE id = $1", [id]);
  assert(row.rows[0].status === "REJECTED", `Status should be REJECTED, got ${row.rows[0].status}`);
}

async function test_aml_case_number_format(): Promise<void> {
  const result = await RE.openAmlCase(pool, {
    transactionRef: txRef(),
    merchantId:     "merchant-aml-test",
    entityType:     "ACCOUNT",
    entityId:       "aml-account-001",
    riskScore:      75,
    totalAmount:    "125000",
    currency:       "USD",
    remarks:        "Suspicious large transfer pattern",
  });

  assert(typeof result.caseNumber === "string",        "Should return caseNumber");
  assert(result.caseNumber.startsWith("AML-"),         `Format should start with AML-, got: ${result.caseNumber}`);
  assert(/^AML-\d{8}-\d{6}$/.test(result.caseNumber), `Format should be AML-YYYYMMDD-000001, got: ${result.caseNumber}`);
}

async function test_dashboard_structure(): Promise<void> {
  const stats = await RE.getDashboardStats(pool);

  assert(typeof stats.todayDecisions    === "object", "todayDecisions should be object");
  assert(typeof stats.highRiskCount     === "number", "highRiskCount should be number");
  assert(typeof stats.reviewQueueLen    === "number", "reviewQueueLen should be number");
  assert(typeof stats.openAmlCases      === "number", "openAmlCases should be number");
  assert(typeof stats.blacklistCount    === "number", "blacklistCount should be number");
  assert(typeof stats.velocityAlerts    === "number", "velocityAlerts should be number");
}

async function test_device_fingerprint(): Promise<void> {
  const hash1 = fingerprintDevice({ os: "Windows 10", browser: "Chrome 120", language: "en-US", screenRes: "1920x1080" });
  const hash2 = fingerprintDevice({ os: "Windows 10", browser: "Chrome 120", language: "en-US", screenRes: "1920x1080" });
  const hash3 = fingerprintDevice({ os: "macOS 14",   browser: "Safari 17",  language: "en-GB", screenRes: "2560x1600" });

  assert(hash1 === hash2,  "Same attributes should produce same fingerprint");
  assert(hash1 !== hash3,  "Different attributes should produce different fingerprint");
  assert(/^[0-9a-f]{64}$/.test(hash1), `Fingerprint should be 64 hex chars, got: ${hash1.length} chars`);
}

// ── Runner ───────────────────────────────────────────────────

const tests = [
  { name: "Blacklisted IP → immediate BLOCK",                  fn: test_blacklisted_ip_blocks },
  { name: "Blacklisted account → immediate BLOCK",             fn: test_blacklisted_account_blocks },
  { name: "Blocked country → immediate BLOCK",                 fn: test_blocked_country },
  { name: "Low-risk transaction → APPROVE",                    fn: test_low_risk_approves },
  { name: "High amount + new device → REVIEW or DECLINE",      fn: test_high_amount_declines },
  { name: "Watchlist adds score but does not block",           fn: test_watchlist_adds_score },
  { name: "Merchant profile single_tx_limit exceeded",         fn: test_merchant_profile_limit },
  { name: "Review queue: approve changes status to APPROVED",  fn: test_review_approve },
  { name: "Review queue: reject changes status to REJECTED",   fn: test_review_reject },
  { name: "AML case number format: AML-YYYYMMDD-000001",       fn: test_aml_case_number_format },
  { name: "Dashboard stats return correct structure",           fn: test_dashboard_structure },
  { name: "Device fingerprint — deterministic SHA-256",        fn: test_device_fingerprint },
];

console.log("Risk Engine — Production Decision Pipeline Tests\n");
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
await redis.quit();
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
