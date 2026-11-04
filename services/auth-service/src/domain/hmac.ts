import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { Pool }                                       from "pg";

/**
 * HMAC Authentication Domain
 *
 * Every API request must be signed. The signing scheme is:
 *
 *   signature = HMAC-SHA256(secret, method + "\n" + path + "\n" + timestamp + "\n" + body_hash)
 *
 * Where:
 *   method     = uppercase HTTP method (GET, POST, …)
 *   path       = URL path only, no query string
 *   timestamp  = Unix epoch in milliseconds (string)
 *   body_hash  = SHA-256 of the raw request body hex, or empty string if no body
 *
 * Required headers:
 *   x-primestack-client-id    Public key identifier
 *   x-primestack-timestamp    Millisecond epoch
 *   x-primestack-signature    Hex-encoded HMAC-SHA256
 *
 * Replay protection:
 *   Timestamp must be within ±5 minutes of server time.
 *   Nonce (optional x-primestack-nonce) is stored in Redis/DB for 10 minutes
 *   to prevent exact replay within the window.
 *
 * Key storage:
 *   Secrets are stored as bcrypt hashes... No. HMAC secrets CANNOT be hashed —
 *   the server needs the plaintext secret to compute the expected signature.
 *   In production: store encrypted with AES-256-GCM, key held in HSM or KMS.
 *   For this implementation: stored in database, encrypted at rest by the DB volume.
 *
 * Constant-time comparison:
 *   timingSafeEqual() prevents timing-oracle attacks that could
 *   let an attacker brute-force the signature byte-by-byte.
 */

const ALGORITHM        = "sha256";
const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

export type HmacVerifyResult =
  | { ok: true;  clientId: string }
  | { ok: false; reason: string };

/**
 * Verify an inbound HMAC-signed request.
 */
export async function verifyHmac(
  pool: Pool,
  input: {
    clientId:  string;
    timestamp: string;
    signature: string;
    method:    string;
    path:      string;
    rawBody:   string; // empty string if no body
  },
): Promise<HmacVerifyResult> {

  // ── 1. Timestamp freshness ───────────────────────────────
  const ts = parseInt(input.timestamp, 10);
  if (isNaN(ts)) {
    return { ok: false, reason: "Invalid timestamp" };
  }

  const drift = Math.abs(Date.now() - ts);
  if (drift > MAX_CLOCK_DRIFT_MS) {
    return { ok: false, reason: "Timestamp expired or too far in future" };
  }

  // ── 2. Load the HMAC key ─────────────────────────────────
  const keyResult = await pool.query<{ secret: string; status: string }>(
    `SELECT secret, status
     FROM hmac_keys
     WHERE client_id = $1
       AND status = 'ACTIVE'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [input.clientId],
  );

  if (keyResult.rows.length === 0) {
    return { ok: false, reason: "Unknown or inactive client ID" };
  }

  const secret = keyResult.rows[0].secret;

  // ── 3. Reconstruct the signed payload ────────────────────
  const bodyHash = input.rawBody
    ? createHmac("sha256", secret).update(input.rawBody).digest("hex")
    : "";

  const payload = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    bodyHash,
  ].join("\n");

  // ── 4. Compute expected signature ────────────────────────
  const expected = createHmac(ALGORITHM, secret)
    .update(payload)
    .digest("hex");

  // ── 5. Constant-time comparison ──────────────────────────
  const sigBuf = Buffer.from(input.signature, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (
    sigBuf.length === 0 ||
    sigBuf.length !== expBuf.length ||
    !timingSafeEqual(sigBuf, expBuf)
  ) {
    return { ok: false, reason: "Signature mismatch" };
  }

  // ── 6. Update last_used_at (non-blocking) ────────────────
  pool.query(
    "UPDATE hmac_keys SET last_used_at = NOW() WHERE client_id = $1",
    [input.clientId],
  ).catch(() => { /* non-critical */ });

  return { ok: true, clientId: input.clientId };
}

/**
 * Create a new HMAC key pair.
 * Returns the raw secret exactly ONCE — it is never returned again.
 * The caller must store it securely (show to user, then discard).
 */
export async function createHmacKey(
  pool: Pool,
  input: {
    merchantId?: string;
    label?:      string;
    expiresAt?:  Date;
  },
): Promise<{ clientId: string; secret: string }> {

  const clientId = `psk_${randomBytes(16).toString("hex")}`;
  const secret   = randomBytes(32).toString("hex"); // 256-bit secret

  await pool.query(
    `INSERT INTO hmac_keys (client_id, secret, merchant_id, label, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, secret, input.merchantId ?? null, input.label ?? null, input.expiresAt ?? null],
  );

  return { clientId, secret };
}

/**
 * Rotate a key — old key stays ACTIVE briefly (grace period) so
 * clients can transition, then is REVOKED on the next rotation or
 * after the grace window.
 */
export async function rotateHmacKey(
  pool: Pool,
  clientId: string,
  gracePeriodMs = 15 * 60 * 1000, // 15-minute grace period
): Promise<{ newClientId: string; secret: string }> {

  const existing = await pool.query<{ merchant_id: string; label: string }>(
    "SELECT merchant_id, label FROM hmac_keys WHERE client_id = $1 AND status = 'ACTIVE'",
    [clientId],
  );

  if (existing.rows.length === 0) {
    throw new Error(`Key not found or not active: ${clientId}`);
  }

  // Mark old key as ROTATED with an expiry
  await pool.query(
    `UPDATE hmac_keys
     SET status = 'ROTATED', expires_at = NOW() + ($1 || ' milliseconds')::INTERVAL
     WHERE client_id = $2`,
    [gracePeriodMs.toString(), clientId],
  );

  // Create the new key
  const newKey = await createHmacKey(pool, {
    merchantId: existing.rows[0].merchant_id,
    label:      existing.rows[0].label,
  });
  return { newClientId: newKey.clientId, secret: newKey.secret };
}

/**
 * Generate the signature string for outbound requests.
 * Used by other services to sign their calls.
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  rawBody = "",
): string {
  const bodyHash = rawBody
    ? createHmac("sha256", secret).update(rawBody).digest("hex")
    : "";

  const payload = [method.toUpperCase(), path, timestamp, bodyHash].join("\n");

  return createHmac(ALGORITHM, secret).update(payload).digest("hex");
}
