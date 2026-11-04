import { createHmac, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { config } from "../../config/index.js";

/**
 * Cryptographic utilities for the switch.
 */

/** Generate a random API key ID */
export function generateKeyId(): string {
  return `psk_${randomBytes(16).toString("hex")}`;
}

/** Generate a random HMAC secret */
export function generateHmacSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a password using bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Verify a password against a bcrypt hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Compute HMAC signature for outbound requests */
export function computeHmacSignature(
  secret: string,
  data: string,
  algorithm: string = config.hmac.algorithm,
): string {
  return createHmac(algorithm, secret).update(data).digest("hex");
}

/** Generate a unique reference code (e.g. for journal entries, transfers) */
export function generateReference(prefix: string = "PSK"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}${random}`;
}

/** Generate a STAN (System Trace Audit Number) — 6-digit zero-padded */
export function generateStan(): string {
  return Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, "0");
}
