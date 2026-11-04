import { Pool }                    from "pg";
import { createHmac, timingSafeEqual,
         randomBytes, createHash,
         createCipheriv, createDecipheriv } from "crypto";
import bcrypt                          from "bcryptjs";

/**
 * Security Service Domain
 *
 * The single source of truth for all cryptographic identities
 * and access control in the platform.
 *
 * Key management principles:
 *
 * 1. API Key secrets use bcrypt (cost 12+).
 *    The plaintext secret is shown ONCE at creation, then discarded.
 *    Verification: bcrypt.compare(submitted, stored_hash).
 *
 * 2. HMAC secrets use AES-256-GCM symmetric encryption.
 *    The encryption key comes from the KMS (env var in dev, HSM in prod).
 *    The server can decrypt to compute HMAC signatures, unlike bcrypt.
 *
 * 3. Private keys are NEVER stored in the database.
 *    In production: generated inside the HSM, never extracted.
 *    In development: generated in memory, shown once.
 *
 * 4. Every security operation emits a security_event.
 *    Failed login attempts, key creations, rotations, revocations.
 *    These are INSERT-ONLY records.
 *
 * 5. Account lockout: 5 failed attempts → locked for 15 minutes.
 *    The lockout doubles after each subsequent breach.
 */

export class SecurityError extends Error {
  constructor(message: string, public code: string, public httpStatus = 401) {
    super(message);
    this.name = "SecurityError";
  }
}

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 15;

// AES-256-GCM for HMAC secret encryption
// In production: key comes from KMS, not env var
const ENCRYPTION_KEY = Buffer.from(
  process.env.SECRET_ENCRYPTION_KEY ?? "0000000000000000000000000000000000000000000000000000000000000000",
  "hex",
).slice(0, 32);

// ── API Key Management ──────────────────────────────────────

/**
 * Create a new API key.
 * Returns the raw secret exactly ONCE — never stored in plaintext.
 */
export async function createApiKey(
  pool: Pool,
  input: {
    merchantId?:    string;
    terminalId?:    string;
    label?:         string;
    scopes:         string[];
    expiresAt?:     Date;
    createdBy?:     string;
    ipRestriction?: string[];
  },
): Promise<{ keyId: string; secret: string; expiresAt?: Date }> {

  const keyId  = `apk_${randomBytes(16).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");   // 256-bit secret
  const hash   = await bcrypt.hash(secret, BCRYPT_ROUNDS);

  await pool.query(
    `INSERT INTO api_keys
       (key_id, key_hash, merchant_id, terminal_id, label, scopes, expires_at, created_by, ip_restriction)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::cidr[])`,
    [
      keyId, hash,
      input.merchantId  ?? null,
      input.terminalId  ?? null,
      input.label       ?? null,
      input.scopes,
      input.expiresAt   ?? null,
      input.createdBy   ?? null,
      input.ipRestriction ?? null,
    ],
  );

  await securityEvent(pool, {
    eventType:    "API_KEY_CREATED",
    actorType:    "USER",
    actorId:      input.createdBy ?? "system",
    resourceType: "api_key",
    resourceId:   keyId,
    description:  `API key created for ${input.merchantId ?? input.terminalId ?? "platform"}`,
    metadata:     { scopes: input.scopes, label: input.label },
  });

  return { keyId, secret, expiresAt: input.expiresAt };
}

/**
 * Verify an API key.
 * Uses bcrypt comparison — constant-time to prevent timing attacks.
 * Updates last_used_at on success.
 */
export async function verifyApiKey(
  pool:     Pool,
  keyId:    string,
  secret:   string,
  fromIp?:  string,
): Promise<{
  valid:      boolean;
  merchantId: string | null;
  terminalId: string | null;
  scopes:     string[];
}> {

  const result = await pool.query<{
    id: string; key_hash: string; status: string;
    merchant_id: string | null; terminal_id: string | null;
    scopes: string[]; expires_at: Date | null; ip_restriction: string[] | null;
  }>(
    `SELECT id, key_hash, status, merchant_id, terminal_id, scopes, expires_at, ip_restriction
     FROM api_keys WHERE key_id = $1`,
    [keyId],
  );

  if (result.rows.length === 0) {
    await securityEvent(pool, { eventType: "API_KEY_INVALID", actorType: "EXTERNAL", actorId: keyId, resourceType: "api_key", resourceId: keyId, description: "Unknown key ID", severity: "WARN" });
    return { valid: false, merchantId: null, terminalId: null, scopes: [] };
  }

  const row = result.rows[0];

  if (row.status !== "ACTIVE") {
    return { valid: false, merchantId: null, terminalId: null, scopes: [] };
  }

  if (row.expires_at && new Date() > row.expires_at) {
    await pool.query("UPDATE api_keys SET status = 'EXPIRED' WHERE id = $1", [row.id]);
    return { valid: false, merchantId: null, terminalId: null, scopes: [] };
  }

  // IP restriction check
  if (fromIp && row.ip_restriction && row.ip_restriction.length > 0) {
    const allowed = await pool.query<{ allowed: boolean }>(
      "SELECT $1::inet = ANY($2::cidr[]) OR ($1::inet << ANY($2::cidr[])) AS allowed",
      [fromIp, row.ip_restriction],
    );
    if (!allowed.rows[0].allowed) {
      await securityEvent(pool, { eventType: "API_KEY_IP_BLOCKED", actorType: "EXTERNAL", actorId: keyId, resourceType: "api_key", resourceId: keyId, description: `IP ${fromIp} not in restriction list`, severity: "WARN" });
      return { valid: false, merchantId: null, terminalId: null, scopes: [] };
    }
  }

  // bcrypt verification — constant-time
  const valid = await bcrypt.compare(secret, row.key_hash);

  if (valid) {
    pool.query(
      "UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $1::inet WHERE id = $2",
      [fromIp ?? null, row.id],
    ).catch(() => { /* non-critical */ });
  } else {
    await securityEvent(pool, { eventType: "API_KEY_AUTH_FAILED", actorType: "EXTERNAL", actorId: keyId, resourceType: "api_key", resourceId: keyId, description: "Secret mismatch", severity: "WARN" });
  }

  return {
    valid,
    merchantId: valid ? row.merchant_id : null,
    terminalId: valid ? row.terminal_id : null,
    scopes:     valid ? row.scopes      : [],
  };
}

// ── HMAC Key Management ──────────────────────────────────────

/**
 * Create a new HMAC key.
 * The secret is encrypted before storage using AES-256-GCM.
 */
export async function createHmacKey(
  pool: Pool,
  input: {
    merchantId?:  string;
    terminalId?:  string;
    label?:       string;
    expiresAt?:   Date;
    createdBy?:   string;
  },
): Promise<{ clientId: string; secret: string }> {

  const clientId       = `psk_${randomBytes(16).toString("hex")}`;
  const secret         = randomBytes(32).toString("hex");
  const secretEncrypted = encryptSecret(secret);

  await pool.query(
    `INSERT INTO hmac_keys (client_id, secret_encrypted, merchant_id, terminal_id, label, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [clientId, secretEncrypted, input.merchantId ?? null, input.terminalId ?? null, input.label ?? null, input.expiresAt ?? null, input.createdBy ?? null],
  );

  await securityEvent(pool, {
    eventType:    "HMAC_KEY_CREATED",
    actorType:    "USER",
    actorId:      input.createdBy ?? "system",
    resourceType: "hmac_key",
    resourceId:   clientId,
    description:  `HMAC key created`,
    metadata:     { merchantId: input.merchantId },
  });

  return { clientId, secret }; // secret shown ONCE
}

/**
 * Verify an HMAC signature.
 * Decrypts the stored secret, computes expected signature, compares in constant time.
 *
 * Payload signed:
 *   METHOD\npath\ntimestamp_ms\nSHA256(body)
 */
export async function verifyHmacSignature(
  pool:      Pool,
  clientId:  string,
  timestamp: string,
  signature: string,
  method:    string,
  path:      string,
  rawBody:   string,
  fromIp?:   string,
): Promise<{ valid: boolean; merchantId: string | null; terminalId: string | null }> {

  // Timestamp drift check — ±5 minutes
  const ts    = parseInt(timestamp, 10);
  const drift = Math.abs(Date.now() - ts);
  if (isNaN(ts) || drift > 5 * 60 * 1000) {
    return { valid: false, merchantId: null, terminalId: null };
  }

  const row = await pool.query<{
    client_id: string; secret_encrypted: string; status: string;
    merchant_id: string | null; terminal_id: string | null;
    expires_at: Date | null; grace_expires_at: Date | null;
  }>(
    `SELECT client_id, secret_encrypted, status, merchant_id, terminal_id, expires_at, grace_expires_at
     FROM hmac_keys
     WHERE client_id = $1
       AND status IN ('ACTIVE','ROTATED')`,
    [clientId],
  );

  if (row.rows.length === 0) return { valid: false, merchantId: null, terminalId: null };

  const key = row.rows[0];
  const now = new Date();

  // Check expiry (including grace period for rotated keys)
  const effectiveExpiry = key.grace_expires_at ?? key.expires_at;
  if (effectiveExpiry && now > effectiveExpiry) {
    return { valid: false, merchantId: null, terminalId: null };
  }

  // Decrypt secret
  let secret: string;
  try {
    secret = decryptSecret(key.secret_encrypted);
  } catch {
    await securityEvent(pool, { eventType: "HMAC_DECRYPT_FAILED", actorType: "EXTERNAL", actorId: clientId, resourceType: "hmac_key", resourceId: clientId, description: "Failed to decrypt HMAC secret", severity: "ERROR" });
    return { valid: false, merchantId: null, terminalId: null };
  }

  // Build payload
  const bodyHash = rawBody ? createHash("sha256").update(rawBody).digest("hex") : "";
  const payload  = [method.toUpperCase(), path, timestamp, bodyHash].join("\n");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // Constant-time comparison
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    await securityEvent(pool, {
      eventType: "HMAC_VERIFY_FAILED", actorType: "EXTERNAL", actorId: clientId,
      resourceType: "hmac_key", resourceId: clientId, description: "Signature mismatch", severity: "WARN",
      metadata: { ip: fromIp, method, path },
    });
    return { valid: false, merchantId: null, terminalId: null };
  }

  // Update last_used_at
  pool.query("UPDATE hmac_keys SET last_used_at = NOW() WHERE client_id = $1", [clientId]).catch(() => {});

  return { valid: true, merchantId: key.merchant_id, terminalId: key.terminal_id };
}

/**
 * Rotate an HMAC key.
 * Old key enters grace period (configurable — default 15 minutes).
 * New key is returned.
 */
export async function rotateHmacKey(
  pool:           Pool,
  clientId:       string,
  gracePeriodMs:  number = 15 * 60 * 1000,
  rotatedBy?:     string,
): Promise<{ clientId: string; secret: string }> {

  const existing = await pool.query<{
    merchant_id: string | null; terminal_id: string | null; label: string | null;
  }>(
    "SELECT merchant_id, terminal_id, label FROM hmac_keys WHERE client_id = $1 AND status = 'ACTIVE'",
    [clientId],
  );

  if (existing.rows.length === 0) {
    throw new SecurityError(`HMAC key not found or not active: ${clientId}`, "KEY_NOT_FOUND", 404);
  }

  const old = existing.rows[0];
  const graceExpiry = new Date(Date.now() + gracePeriodMs);

  await pool.query(
    "UPDATE hmac_keys SET status = 'ROTATED', grace_expires_at = $1 WHERE client_id = $2",
    [graceExpiry, clientId],
  );

  const newKey = await createHmacKey(pool, {
    merchantId: old.merchant_id ?? undefined,
    terminalId: old.terminal_id ?? undefined,
    label:      old.label ?? undefined,
    createdBy:  rotatedBy,
  });

  await pool.query(
    "UPDATE hmac_keys SET rotated_from = $1 WHERE client_id = $2",
    [clientId, newKey.clientId],
  );

  await securityEvent(pool, {
    eventType:    "HMAC_KEY_ROTATED",
    actorType:    "USER",
    actorId:      rotatedBy ?? "system",
    resourceType: "hmac_key",
    resourceId:   clientId,
    description:  `Rotated to ${newKey.clientId}, grace until ${graceExpiry.toISOString()}`,
    severity:     "INFO",
  });

  return newKey;
}

// ── User Authentication ──────────────────────────────────────

/**
 * Authenticate a user (admin login).
 * Returns the user record on success, throws on failure.
 * Implements account lockout after MAX_FAILED_ATTEMPTS.
 */
export async function authenticateUser(
  pool:      Pool,
  email:     string,
  password:  string,
  fromIp?:   string,
  userAgent?: string,
): Promise<{
  userId:   string;
  email:    string;
  fullName: string;
  roleId:   string;
  roleName: string;
  scopes:   string[];
}> {

  const result = await pool.query<{
    id:              string;
    email:           string;
    full_name:       string;
    password_hash:   string;
    role_id:         string;
    role_name:       string;
    is_active:       boolean;
    failed_attempts: number;
    locked_until:    Date | null;
  }>(
    `SELECT u.id, u.email, u.full_name, u.password_hash, u.role_id,
            r.name as role_name, u.is_active, u.failed_attempts, u.locked_until
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email],
  );

  const fail = async (reason: string, severity: "WARN" | "ERROR" = "WARN") => {
    await securityEvent(pool, {
      eventType: "LOGIN_FAILED", actorType: "USER", actorId: email,
      resourceType: "user", resourceId: email,
      description: reason, severity,
      metadata: { ip: fromIp, userAgent },
    });
    throw new SecurityError("Invalid credentials", "AUTH_FAILED", 401);
  };

  if (result.rows.length === 0) {
    // Do a dummy bcrypt compare to prevent timing oracle
    await bcrypt.compare(password, "$2b$12$invalidhashinvalid");
    await fail("Unknown email");
    throw new SecurityError("Invalid credentials", "AUTH_FAILED"); // unreachable but TypeScript needs it
  }

  const user = result.rows[0];

  if (!user.is_active) await fail("Account inactive");

  // Lockout check
  if (user.locked_until && new Date() < user.locked_until) {
    await fail(`Account locked until ${user.locked_until.toISOString()}`);
  }

  // Password verification
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const newAttempts = user.failed_attempts + 1;
    const locked      = newAttempts >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = locked
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000 * Math.pow(2, Math.floor(newAttempts / MAX_FAILED_ATTEMPTS) - 1))
      : null;

    await pool.query(
      "UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3",
      [newAttempts, lockedUntil, user.id],
    );

    await fail(`Password mismatch (attempt ${newAttempts}/${MAX_FAILED_ATTEMPTS})`);
    throw new SecurityError("Invalid credentials", "AUTH_FAILED");
  }

  // Success — reset lockout, update last_login
  await pool.query(
    "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1::inet WHERE id = $2",
    [fromIp ?? null, user.id],
  );

  await securityEvent(pool, {
    eventType:    "LOGIN_SUCCESS",
    actorType:    "USER",
    actorId:      user.id,
    resourceType: "user",
    resourceId:   user.id,
    description:  `User logged in`,
    metadata:     { ip: fromIp, userAgent },
  });

  return {
    userId:   user.id,
    email:    user.email,
    fullName: user.full_name,
    roleId:   user.role_id,
    roleName: user.role_name,
    scopes:   [],
  };
}

/**
 * Create a user account with bcrypt password hash.
 */
export async function createUser(
  pool: Pool,
  input: {
    email:      string;
    username:   string;
    password:   string;
    fullName:   string;
    roleName:   string;
    merchantId?: string;
    createdBy?:  string;
  },
) {
  const role = await pool.query<{ id: string }>(
    "SELECT id FROM roles WHERE name = $1", [input.roleName],
  );
  if (role.rows.length === 0) throw new SecurityError(`Role not found: ${input.roleName}`, "ROLE_NOT_FOUND", 422);

  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, username, password_hash, full_name, role_id, merchant_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.email, input.username, hash, input.fullName, role.rows[0].id, input.merchantId ?? null],
  );

  await securityEvent(pool, {
    eventType:    "USER_CREATED",
    actorType:    "USER",
    actorId:      input.createdBy ?? "system",
    resourceType: "user",
    resourceId:   result.rows[0].id,
    description:  `User ${input.email} created with role ${input.roleName}`,
  });

  return { userId: result.rows[0].id };
}

/**
 * Check if a user has a required permission.
 */
export async function hasPermission(
  pool:       Pool,
  roleId:     string,
  permission: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.name = $2
     ) AS exists`,
    [roleId, permission],
  );
  return result.rows[0].exists;
}

/**
 * Get expiring certificates for monitoring.
 */
export async function getExpiringCertificates(pool: Pool, daysAhead = 30) {
  const threshold = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return pool.query(
    `SELECT id, label, cert_type, subject, fingerprint_sha256, valid_to, terminal_id, merchant_id
     FROM certificates
     WHERE status = 'ACTIVE' AND valid_to <= $1
     ORDER BY valid_to ASC`,
    [threshold],
  );
}

// ── Private: encryption helpers ─────────────────────────────

function encryptSecret(plaintext: string): string {
  const iv         = randomBytes(12);
  const cipher     = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  // Format: iv(24hex) + authTag(32hex) + encrypted(hex)
  return iv.toString("hex") + authTag.toString("hex") + encrypted.toString("hex");
}

function decryptSecret(ciphertext: string): string {
  const iv         = Buffer.from(ciphertext.slice(0, 24), "hex");
  const authTag    = Buffer.from(ciphertext.slice(24, 56), "hex");
  const encrypted  = Buffer.from(ciphertext.slice(56), "hex");
  const decipher   = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

// ── Private: security event logger ──────────────────────────

async function securityEvent(
  pool: Pool,
  event: {
    eventType:    string;
    severity?:    string;
    actorType:    string;
    actorId?:     string;
    resourceType?: string;
    resourceId?:  string;
    description:  string;
    metadata?:    Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO security_events
       (event_type, severity, actor_type, actor_id, resource_type, resource_id, description, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      event.eventType,
      event.severity    ?? "INFO",
      event.actorType,
      event.actorId     ?? null,
      event.resourceType ?? null,
      event.resourceId   ?? null,
      event.description,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ],
  ).catch((err) => console.error("[security] event log failed:", err.message));
}
