import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { config } from "../../config/index.js";
import { AppError } from "../../core/errors.js";

/**
 * AES-256-GCM encryption for S2S connection API secrets at rest.
 *
 * Wire format (base64-encoded):
 *   [12-byte IV] [16-byte GCM auth tag] [variable-length ciphertext]
 *
 * Key source: S2S_SECRET_KEY env var (64 hex chars = 32 bytes).
 *
 * Rotation: when rotating the key, re-encrypt all existing apiSecret
 * values before updating S2S_SECRET_KEY. The encrypted blobs are
 * self-contained (IV is embedded), so decryption always uses the
 * key that was active when the blob was created.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES   = 12;   // GCM standard
const TAG_BYTES  = 16;

function getKey(): Buffer {
  const hex = config.s2s.secretKey;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new AppError(
      "S2S_SECRET_KEY must be exactly 64 hex characters (32 bytes). Set it in your .env file.",
      500,
      "S2S_KEY_MISCONFIGURED",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext secret. Returns a base64 blob safe to store in the DB.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();            // 16 bytes

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt a blob produced by encryptSecret(). Throws on tampered data.
 */
export function decryptSecret(blob: string): string {
  const data = Buffer.from(blob, "base64");

  if (data.length < IV_BYTES + TAG_BYTES + 1) {
    throw new AppError("Encrypted secret blob is too short — data may be corrupted", 500, "S2S_DECRYPT_FAILED");
  }

  const iv        = data.subarray(0, IV_BYTES);
  const tag       = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = data.subarray(IV_BYTES + TAG_BYTES);

  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    throw new AppError(
      "Secret decryption failed — the blob may be corrupted or the key is wrong",
      500,
      "S2S_DECRYPT_FAILED",
    );
  }
}
