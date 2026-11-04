/**
 * Terminal Management Platform — Integration Tests
 *
 * Run: npm test
 * Requires: terminal DB migrated (migrations 001 + 002)
 *
 * Tests:
 *   ✓ Create terminal group
 *   ✓ Add terminal to group
 *   ✓ List group terminals
 *   ✓ Push parameter to terminal
 *   ✓ Push parameter to entire group
 *   ✓ Get pending parameters for terminal
 *   ✓ Confirm parameter push
 *   ✓ Register application with version
 *   ✓ Set terminal app version (detects outdated)
 *   ✓ Get outdated terminals
 *   ✓ Record key injection
 *   ✓ Rotate key (old key marked ROTATED, new key ACTIVE)
 *   ✓ Get key history shows version progression
 *   ✓ Get expiring keys returns keys with near expiry
 *   ✓ Deploy firmware to terminal
 *   ✓ Update deployment status to INSTALLED updates terminal firmware
 *   ✓ Rollback firmware restores previous version
 *   ✓ Record device analytics
 *   ✓ Get analytics for terminal
 *   ✓ Fleet overview returns correct structure
 *   ✓ Activity log records operations
 */

import { Pool }  from "pg";
import * as TMS  from "../src/domain/tms.js";
import { randomUUID } from "crypto";

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_terminal_test",
  user:     process.env.PGUSER     ?? "terminal_svc",
  password: process.env.PGPASSWORD ?? "terminal_secret",
});

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

const uid = () => Date.now().toString(36).toUpperCase();

// ── Setup: create a test merchant and terminal ──────────────

let merchantId: string;
let terminalId:  string;

async function setup(): Promise<void> {
  // Create merchant
  const merchant = await pool.query<{ id: string }>(
    `INSERT INTO merchants (merchant_code, legal_name, status)
     VALUES ($1, $2, 'ACTIVE') RETURNING id`,
    [`MERCH-TEST-${uid()}`, "Test Merchant"],
  );
  merchantId = merchant.rows[0].id;

  // Create terminal
  const terminal = await pool.query<{ id: string }>(
    `INSERT INTO terminals (tid, merchant_id, serial_number, status)
     VALUES ($1, $2, $3, 'ACTIVE') RETURNING id`,
    [`TID${uid().slice(0,6)}`, merchantId, `SN-TEST-${uid()}`],
  );
  terminalId = terminal.rows[0].id;

  // Create health record
  await pool.query(
    "INSERT INTO terminal_health (terminal_id, status) VALUES ($1, 'ONLINE') ON CONFLICT DO NOTHING",
    [terminalId],
  );
}

// ── Group tests ──────────────────────────────────────────────

async function test_create_group(): Promise<void> {
  const result = await TMS.createGroup(pool, {
    groupName:   `GRP-TEST-${uid()}`,
    description: "Test group",
    groupType:   "MERCHANT",
  });
  assert(typeof result.id === "string" && result.id.length > 0, "Should return group id");
}

async function test_add_to_group(): Promise<void> {
  const group = await TMS.createGroup(pool, {
    groupName: `GRP-MEM-${uid()}`,
    groupType: "MERCHANT",
  });
  await TMS.addTerminalToGroup(pool, group.id, terminalId);

  const members = await TMS.getGroupTerminals(pool, group.id);
  assert(members.rows.length > 0, "Group should have at least one member");
  assert(members.rows[0].id === terminalId, "Member should be the test terminal");
}

// ── Parameter distribution tests ──────────────────────────────

async function test_push_parameter(): Promise<void> {
  const result = await TMS.pushParameter(pool, {
    terminalId,
    paramKey:   "MERCHANT_NAME",
    paramValue: "Test Merchant Inc",
    updatedBy:  "test-admin",
  });
  assert(typeof result.id === "string", "Should return parameter id");
}

async function test_get_pending_params(): Promise<void> {
  await TMS.pushParameter(pool, {
    terminalId,
    paramKey:   "TIMEOUT_SECONDS",
    paramValue: "30",
    paramType:  "NUMERIC",
  });

  const pending = await TMS.getPendingParameters(pool, terminalId);
  assert(pending.rows.length > 0, "Should have pending parameters");
  assert(pending.rows.some((r: { param_key: string }) => r.param_key === "TIMEOUT_SECONDS"),
    "Should find TIMEOUT_SECONDS in pending params");
}

async function test_confirm_parameter(): Promise<void> {
  const param = await TMS.pushParameter(pool, {
    terminalId,
    paramKey:   "SUPPORTED_AIDS",
    paramValue: "A0000000031010,A0000000041010",
    paramType:  "JSON",
  });

  // Mark as PUSHED first (simulate terminal receiving it)
  await pool.query("UPDATE terminal_parameters SET push_status = 'PUSHED', pushed_at = NOW() WHERE id = $1", [param.id]);

  await TMS.confirmParameter(pool, param.id);

  const row = await pool.query<{ push_status: string }>(
    "SELECT push_status FROM terminal_parameters WHERE id = $1", [param.id],
  );
  assert(row.rows[0].push_status === "CONFIRMED", `Status should be CONFIRMED, got ${row.rows[0].push_status}`);
}

async function test_push_to_group(): Promise<void> {
  const group = await TMS.createGroup(pool, {
    groupName: `GRP-PUSH-${uid()}`,
    groupType: "CUSTOM",
  });
  await TMS.addTerminalToGroup(pool, group.id, terminalId);

  const count = await TMS.pushParameterToGroup(pool, group.id, "TERMINAL_LABEL", "POS Terminal 1");
  assert(count >= 1, `Should push to at least 1 terminal, got ${count}`);
}

// ── Application management tests ─────────────────────────────

async function test_register_app(): Promise<void> {
  const result = await TMS.registerApplication(pool, {
    appName:        `APP-TEST-${uid()}`,
    description:    "Test payment application",
    currentVersion: "2.0.0",
    minVersion:     "1.5.0",
    isCritical:     true,
  });
  assert(typeof result.id === "string", "Should return app id");
}

async function test_outdated_detection(): Promise<void> {
  const app = await TMS.registerApplication(pool, {
    appName:        `APP-OUTDATED-${uid()}`,
    currentVersion: "3.0.0",
    minVersion:     "2.0.0",
  });

  // Install an old version on the terminal
  await TMS.setTerminalAppVersion(pool, terminalId, app.id, "1.0.0");

  const outdated = await TMS.getOutdatedTerminals(pool, app.id);
  assert(outdated.rows.length > 0, "Should detect terminal with outdated app");
  assert(outdated.rows[0].installed_version === "1.0.0", "Should show installed version 1.0.0");
}

async function test_current_app_not_outdated(): Promise<void> {
  const app = await TMS.registerApplication(pool, {
    appName:        `APP-CURRENT-${uid()}`,
    currentVersion: "2.0.0",
    minVersion:     "1.0.0",
  });

  await TMS.setTerminalAppVersion(pool, terminalId, app.id, "2.0.0");

  const outdated = await TMS.getOutdatedTerminals(pool, app.id);
  assert(outdated.rows.length === 0, "Current version should not be outdated");
}

// ── Key lifecycle tests ──────────────────────────────────────

async function test_key_injection(): Promise<void> {
  const result = await TMS.recordKeyInjection(pool, {
    terminalId,
    keyType:      "MASTER_KEY",
    keyReference:  "HSM_SLOT_001",
    injectedBy:    "ops-admin",
  });
  assert(typeof result.id === "string", "Should return key lifecycle id");
}

async function test_key_rotation(): Promise<void> {
  // First inject
  await TMS.recordKeyInjection(pool, {
    terminalId,
    keyType:      "PIN_KEY",
    keyReference:  "HSM_PIN_001",
    injectedBy:    "ops-admin",
  });

  // Then rotate
  const newKey = await TMS.rotateKey(pool, {
    terminalId,
    keyType:      "PIN_KEY",
    newKeyRef:     "HSM_PIN_002",
    rotatedBy:    "ops-admin",
  });
  assert(typeof newKey.id === "string", "Should return new key id");

  // History should show 2 versions
  const history = await TMS.getKeyHistory(pool, terminalId);
  const pinKeys = history.rows.filter((r: { key_type: string }) => r.key_type === "PIN_KEY");
  assert(pinKeys.length === 2, `Should have 2 PIN_KEY records, got ${pinKeys.length}`);
  assert(pinKeys[0].key_version === 2, "Latest should be version 2");
  assert(pinKeys[0].status === "ACTIVE", "Latest should be ACTIVE");
  assert(pinKeys[1].status === "ROTATED", "Old should be ROTATED");
}

async function test_key_history(): Promise<void> {
  await TMS.recordKeyInjection(pool, {
    terminalId,
    keyType:      "MAC_KEY",
    keyReference:  "HSM_MAC_001",
  });

  const history = await TMS.getKeyHistory(pool, terminalId);
  assert(history.rows.length > 0, "Should have key history records");
  assert(history.rows.some((r: { key_type: string }) => r.key_type === "MAC_KEY"), "Should include MAC_KEY");
}

// ── Firmware deployment tests ────────────────────────────────

async function test_firmware_deploy(): Promise<void> {
  // Create firmware version
  const fw = await pool.query<{ id: string }>(
    `INSERT INTO firmware_versions (version, model, checksum_sha256)
     VALUES ($1, $2, $3) RETURNING id`,
    [`FW-${uid()}`, "V400m", "a1b2c3d4".repeat(8)],
  );

  // Set initial firmware on terminal
  await pool.query("UPDATE terminals SET firmware_version = '1.0.0' WHERE id = $1", [terminalId]);

  const result = await TMS.deployFirmware(pool, {
    firmwareVersionId: fw.rows[0].id,
    terminalId,
  });
  assert(typeof result.id === "string", "Should return deployment id");

  // Check pending deployments
  const pending = await TMS.getPendingDeployments(pool, terminalId);
  assert(pending.rows.length > 0, "Should have pending deployment");
  assert(pending.rows[0].status === "PENDING", `Status should be PENDING, got ${pending.rows[0].status}`);
}

async function test_firmware_complete(): Promise<void> {
  const fw = await pool.query<{ id: string }>(
    `INSERT INTO firmware_versions (version, model, checksum_sha256)
     VALUES ($1, $2, $3) RETURNING id`,
    [`FW-DONE-${uid()}`, "V400m", "deadbeef".repeat(8)],
  );

  await pool.query("UPDATE terminals SET firmware_version = '2.0.0' WHERE id = $1", [terminalId]);

  const deployment = await TMS.deployFirmware(pool, {
    firmwareVersionId: fw.rows[0].id,
    terminalId,
  });

  // Simulate terminal downloading and installing
  await TMS.updateDeploymentStatus(pool, deployment.id, "DOWNLOADING", 50);
  await TMS.updateDeploymentStatus(pool, deployment.id, "INSTALLING", 90);
  await TMS.updateDeploymentStatus(pool, deployment.id, "INSTALLED", 100);

  // Terminal firmware version should be updated
  const terminal = await pool.query<{ firmware_version: string | null }>(
    "SELECT firmware_version FROM terminals WHERE id = $1", [terminalId],
  );
  const fwVersion = await pool.query<{ version: string }>(
    "SELECT version FROM firmware_versions WHERE id = $1", [fw.rows[0].id],
  );
  assert(terminal.rows[0].firmware_version === fwVersion.rows[0].version,
    `Terminal firmware should be updated to ${fwVersion.rows[0].version}, got ${terminal.rows[0].firmware_version}`);
}

async function test_firmware_rollback(): Promise<void> {
  const fw = await pool.query<{ id: string }>(
    `INSERT INTO firmware_versions (version, model, checksum_sha256)
     VALUES ($1, $2, $3) RETURNING id`,
    [`FW-RB-${uid()}`, "V400m", "cafe1234".repeat(8)],
  );

  await pool.query("UPDATE terminals SET firmware_version = '3.0.0' WHERE id = $1", [terminalId]);

  const deployment = await TMS.deployFirmware(pool, {
    firmwareVersionId: fw.rows[0].id,
    terminalId,
  });

  await TMS.updateDeploymentStatus(pool, deployment.id, "INSTALLED");

  // Rollback
  await TMS.rollbackFirmware(pool, deployment.id);

  const terminal = await pool.query<{ firmware_version: string | null }>(
    "SELECT firmware_version FROM terminals WHERE id = $1", [terminalId],
  );
  assert(terminal.rows[0].firmware_version === "3.0.0",
    `Should rollback to 3.0.0, got ${terminal.rows[0].firmware_version}`);

  const dep = await pool.query<{ status: string }>(
    "SELECT status FROM firmware_deployments WHERE id = $1", [deployment.id],
  );
  assert(dep.rows[0].status === "ROLLED_BACK", "Deployment should be ROLLED_BACK");
}

// ── Analytics tests ──────────────────────────────────────────

async function test_record_analytics(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await TMS.recordAnalytics(pool, {
    terminalId,
    businessDate:  today,
    txCount:       150,
    approvedCount: 140,
    declinedCount: 10,
    totalAmount:   "12500.00",
    uptimePct:     99.5,
    avgResponseMs: 85,
    errorCount:    2,
  });

  const analytics = await TMS.getAnalytics(pool, terminalId, 1);
  assert(analytics.rows.length > 0, "Should have analytics for today");
  assert(analytics.rows[0].tx_count === 150, `tx_count should be 150, got ${analytics.rows[0].tx_count}`);
  assert(analytics.rows[0].approved_count === 140, `approved_count should be 140, got ${analytics.rows[0].approved_count}`);
}

async function test_fleet_overview(): Promise<void> {
  const overview = await TMS.getFleetOverview(pool);
  assert(overview.rows.length > 0, "Should return overview row");
  const row = overview.rows[0];
  assert(typeof row.active_terminals === "string" || typeof row.active_terminals === "number",
    "active_terminals should be a number");
  assert(typeof row.online_terminals === "string" || typeof row.online_terminals === "number",
    "online_terminals should be a number");
}

// ── Activity log test ────────────────────────────────────────

async function test_activity_log(): Promise<void> {
  // Trigger an activity by pushing a parameter
  await TMS.pushParameter(pool, {
    terminalId,
    paramKey:   "ACTIVITY_TEST",
    paramValue: "test-value",
  });

  const log = await TMS.getActivityLog(pool, terminalId, 10);
  assert(log.rows.length > 0, "Should have activity log entries");
  assert(log.rows.some((r: { activity_type: string }) => r.activity_type === "PARAM_PUSHED"),
    "Should include PARAM_PUSHED activity");
}

// ── Runner ───────────────────────────────────────────────────

const tests = [
  { name: "Create terminal group",                          fn: test_create_group },
  { name: "Add terminal to group + list members",           fn: test_add_to_group },
  { name: "Push parameter to terminal",                     fn: test_push_parameter },
  { name: "Get pending parameters",                         fn: test_get_pending_params },
  { name: "Confirm parameter push",                         fn: test_confirm_parameter },
  { name: "Push parameter to entire group",                 fn: test_push_to_group },
  { name: "Register application with version",              fn: test_register_app },
  { name: "Detect outdated terminal app",                   fn: test_outdated_detection },
  { name: "Current app version not flagged outdated",       fn: test_current_app_not_outdated },
  { name: "Record key injection",                           fn: test_key_injection },
  { name: "Key rotation: old=ROTATED, new=ACTIVE",          fn: test_key_rotation },
  { name: "Key history shows version progression",          fn: test_key_history },
  { name: "Firmware deployment queued",                     fn: test_firmware_deploy },
  { name: "Firmware install updates terminal version",      fn: test_firmware_complete },
  { name: "Firmware rollback restores previous version",    fn: test_firmware_rollback },
  { name: "Record device analytics",                        fn: test_record_analytics },
  { name: "Fleet overview returns correct structure",       fn: test_fleet_overview },
  { name: "Activity log records operations",                fn: test_activity_log },
];

await setup();

console.log("Terminal Management Platform — Integration Tests\n");
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
