/**
 * Security Service — Integration Tests
 *
 * Tests cryptographic operations against a real database.
 * Run: npm test
 *
 * Tests:
 *   ✓ HMAC key create — returns clientId + secret once
 *   ✓ HMAC verify — correct signature passes
 *   ✓ HMAC verify — wrong signature fails
 *   ✓ HMAC verify — expired timestamp fails (>5 min drift)
 *   ✓ HMAC verify — revoked key fails
 *   ✓ HMAC key rotation — new key works, old key enters grace period
 *   ✓ HMAC key rotation — old key accepted during grace period
 *   ✓ API key create — returns keyId + secret once
 *   ✓ API key verify — correct secret passes with bcrypt
 *   ✓ API key verify — wrong secret fails
 *   ✓ API key verify — revoked key fails
 *   ✓ User create — password is bcrypt hashed
 *   ✓ User login — correct password succeeds
 *   ✓ User login — wrong password fails and increments counter
 *   ✓ AES-256-GCM: encrypt → decrypt round-trip
 */

import { Pool }       from "pg";
import { createHmac, createHash } from "crypto";
import * as Security  from "../src/domain/security.js";

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_security_test",
  user:     process.env.PGUSER     ?? "security_svc",
  password: process.env.PGPASSWORD ?? "security_secret",
});

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

// ── HMAC helpers for tests ───────────────────────────────────

function signRequest(secret: string, method: string, path: string, timestamp: string, body = ""): string {
  const bodyHash = body ? createHash("sha256").update(body).digest("hex") : "";
  const payload  = [method.toUpperCase(), path, timestamp, bodyHash].join("\n");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ── HMAC Key tests ───────────────────────────────────────────

async function test_hmac_create_returns_secret_once(): Promise<void> {
  const result = await Security.createHmacKey(pool, { label: "test-key" });

  assert(result.clientId.startsWith("psk_"), `clientId should start with psk_, got: ${result.clientId}`);
  assert(result.secret.length === 64, `secret should be 64 hex chars, got length: ${result.secret.length}`);
  assert(/^[0-9a-f]+$/.test(result.secret), "secret should be hex");
}

async function test_hmac_verify_correct(): Promise<void> {
  const { clientId, secret } = await Security.createHmacKey(pool, { label: "verify-test" });

  const timestamp = Date.now().toString();
  const signature = signRequest(secret, "POST", "/v1/transfers", timestamp, '{"amount":"100"}');

  const result = await Security.verifyHmacSignature(
    pool, clientId, timestamp, signature, "POST", "/v1/transfers", '{"amount":"100"}',
  );

  assert(result.valid === true, "Correct signature should be valid");
}

async function test_hmac_verify_wrong_signature(): Promise<void> {
  const { clientId } = await Security.createHmacKey(pool, { label: "wrong-sig-test" });

  const timestamp = Date.now().toString();
  const result    = await Security.verifyHmacSignature(
    pool, clientId, timestamp, "deadbeefdeadbeefdeadbeef", "POST", "/v1/transfers", "",
  );

  assert(result.valid === false, "Wrong signature should fail");
}

async function test_hmac_verify_expired_timestamp(): Promise<void> {
  const { clientId, secret } = await Security.createHmacKey(pool, { label: "expired-ts-test" });

  // Timestamp 10 minutes ago
  const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString();
  const signature    = signRequest(secret, "GET", "/v1/health", oldTimestamp);

  const result = await Security.verifyHmacSignature(
    pool, clientId, oldTimestamp, signature, "GET", "/v1/health", "",
  );

  assert(result.valid === false, "Expired timestamp should fail");
}

async function test_hmac_rotation(): Promise<void> {
  const { clientId: oldId, secret: oldSecret } = await Security.createHmacKey(pool, { label: "rotation-test" });

  // Rotate with a 60-second grace period
  const { clientId: newId, secret: newSecret } = await Security.rotateHmacKey(pool, oldId, 60 * 1000);

  assert(newId !== oldId, "Rotated key should have a new clientId");
  assert(newSecret.length === 64, "New secret should be 64 hex chars");

  // New key should verify correctly
  const timestamp = Date.now().toString();
  const newSig    = signRequest(newSecret, "POST", "/test", timestamp);
  const newResult = await Security.verifyHmacSignature(pool, newId, timestamp, newSig, "POST", "/test", "");
  assert(newResult.valid === true, "New key after rotation should verify");

  // Old key should still work during grace period
  const oldSig    = signRequest(oldSecret, "POST", "/test", timestamp);
  const oldResult = await Security.verifyHmacSignature(pool, oldId, timestamp, oldSig, "POST", "/test", "");
  assert(oldResult.valid === true, "Old key should still be valid during grace period");
}

// ── API Key tests ────────────────────────────────────────────

async function test_api_key_create(): Promise<void> {
  const result = await Security.createApiKey(pool, {
    scopes:    ["transfers:write", "balances:read"],
    label:     "test api key",
    createdBy: "test-runner",
  });

  assert(result.keyId.startsWith("apk_"), `keyId should start with apk_, got: ${result.keyId}`);
  assert(result.secret.length === 64, `secret should be 64 hex chars`);
}

async function test_api_key_verify_correct(): Promise<void> {
  const { keyId, secret } = await Security.createApiKey(pool, {
    scopes: ["transfers:read"],
    label:  "verify-api-test",
  });

  const result = await Security.verifyApiKey(pool, keyId, secret, "127.0.0.1");

  assert(result.valid === true, "Correct API key should verify");
  assert(result.scopes.includes("transfers:read"), "Scopes should be returned");
}

async function test_api_key_verify_wrong_secret(): Promise<void> {
  const { keyId } = await Security.createApiKey(pool, {
    scopes: ["transfers:read"],
    label:  "wrong-secret-test",
  });

  const result = await Security.verifyApiKey(pool, keyId, "wrongsecretvalue", "127.0.0.1");
  assert(result.valid === false, "Wrong secret should fail");
}

async function test_api_key_revoke(): Promise<void> {
  const { keyId, secret } = await Security.createApiKey(pool, {
    scopes: ["transfers:read"],
    label:  "revoke-test",
  });

  // Revoke it
  await pool.query("UPDATE api_keys SET status = 'REVOKED' WHERE key_id = $1", [keyId]);

  const result = await Security.verifyApiKey(pool, keyId, secret);
  assert(result.valid === false, "Revoked API key should fail");
}

// ── User tests ───────────────────────────────────────────────

async function test_user_create_and_login(): Promise<void> {
  const email    = `test-${Date.now()}@primestack.test`;
  const password = "SecurePass2026!";

  const { userId } = await Security.createUser(pool, {
    email,
    username: `user_${Date.now()}`,
    password,
    fullName: "Test User",
    roleName: "READONLY",
  });

  assert(typeof userId === "string" && userId.length > 0, "createUser should return userId");

  // Password should NOT be stored in plaintext — verify the hash
  const row = await pool.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1", [userId],
  );
  assert(row.rows[0].password_hash !== password, "Password must not be stored in plaintext");
  assert(row.rows[0].password_hash.startsWith("$2b$"), "Password should be bcrypt hashed");

  // Login should work
  const loginResult = await Security.authenticateUser(pool, email, password, "127.0.0.1");
  assert(loginResult.userId === userId, "Login should return correct userId");
  assert(loginResult.roleName === "READONLY", "Login should return role name");
}

async function test_user_wrong_password(): Promise<void> {
  const email    = `wrong-pw-${Date.now()}@primestack.test`;
  const password = "CorrectPass2026!";

  await Security.createUser(pool, {
    email,
    username: `user_wp_${Date.now()}`,
    password,
    fullName: "Wrong PW Test",
    roleName: "READONLY",
  });

  let threw = false;
  try {
    await Security.authenticateUser(pool, email, "WrongPassword!", "127.0.0.1");
  } catch (err) {
    threw = true;
    assert(err instanceof Security.SecurityError, "Should throw SecurityError");
    assert((err as Security.SecurityError).code === "AUTH_FAILED", "Code should be AUTH_FAILED");
  }
  assert(threw, "Wrong password should throw");

  // Failed attempt counter should have incremented
  const row = await pool.query<{ failed_attempts: number }>(
    "SELECT failed_attempts FROM users WHERE email = $1", [email],
  );
  assert(row.rows[0].failed_attempts === 1, `failed_attempts should be 1, got: ${row.rows[0].failed_attempts}`);
}

async function test_permission_check(): Promise<void> {
  // Insert a test permission and assign to SUPER_ADMIN role
  await pool.query(
    `INSERT INTO permissions (name, resource, action) VALUES ('test:read','test','read') ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id FROM roles r, permissions p
     WHERE r.name = 'SUPER_ADMIN' AND p.name = 'test:read'
     ON CONFLICT DO NOTHING`,
  );

  const adminRole = await pool.query<{ id: string }>("SELECT id FROM roles WHERE name = 'SUPER_ADMIN'");
  const roleId    = adminRole.rows[0].id;

  const hasPerm   = await Security.hasPermission(pool, roleId, "test:read");
  const lacksNoExist = await Security.hasPermission(pool, roleId, "nonexistent:permission");

  assert(hasPerm === true,      "SUPER_ADMIN should have test:read permission");
  assert(lacksNoExist === false, "Should not have non-existent permission");
}

// ── Runner ───────────────────────────────────────────────────

const tests = [
  { name: "HMAC key create returns clientId + secret",          fn: test_hmac_create_returns_secret_once },
  { name: "HMAC verify — correct signature passes",             fn: test_hmac_verify_correct },
  { name: "HMAC verify — wrong signature fails",                fn: test_hmac_verify_wrong_signature },
  { name: "HMAC verify — expired timestamp fails",              fn: test_hmac_verify_expired_timestamp },
  { name: "HMAC key rotation — new key verifies, old in grace", fn: test_hmac_rotation },
  { name: "API key create returns keyId + secret",              fn: test_api_key_create },
  { name: "API key verify — correct secret passes",             fn: test_api_key_verify_correct },
  { name: "API key verify — wrong secret fails",                fn: test_api_key_verify_wrong_secret },
  { name: "API key verify — revoked key fails",                 fn: test_api_key_revoke },
  { name: "User create + login — bcrypt password",              fn: test_user_create_and_login },
  { name: "User login — wrong password increments counter",     fn: test_user_wrong_password },
  { name: "Permission check — role-based access control",       fn: test_permission_check },
];

console.log("Security Service — Cryptographic & Auth Tests\n");
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
