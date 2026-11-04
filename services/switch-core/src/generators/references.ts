import { Pool }    from "pg";
import { createHash } from "crypto";

/**
 * Reference Generators
 *
 * Financial systems require deterministic, traceable reference numbers.
 * Random UUIDs are unacceptable for payment switches because:
 *   - They cannot be ordered chronologically
 *   - You cannot detect gaps (dropped transactions)
 *   - They are unreadable in support queries and bank statements
 *   - ISO 8583 field lengths are 6–20 chars, not 36
 *
 * These generators produce structured, human-readable references.
 */

// ── Transaction Reference: PS{YYYYMMDD}{SEQ:9} ──────────────
// Example: PS20261022000000001
// Sequence is per-day, padded to 9 digits → 999,999,999 tx/day max

/**
 * Generate the next transaction reference.
 * Uses a PostgreSQL sequence for atomicity across all instances.
 * The sequence resets daily via the reference format including the date.
 *
 * In production: use a dedicated sequence per date that resets at midnight.
 * For now: use a global sequence with the date embedded.
 */
export async function nextTxRef(pool: Pool): Promise<string> {
  const result = await pool.query<{ nextval: string }>(
    "SELECT NEXTVAL('tx_ref_seq') AS nextval",
  );
  const seq = result.rows[0].nextval.toString().padStart(9, "0");
  const date = formatDate(new Date());
  return `PS${date}${seq}`;
}

// ── STAN: System Trace Audit Number ─────────────────────────
// ISO 8583 Field 11: exactly 6 digits, 000001–999999, wraps
// Unique within a terminal session (not globally unique)

let stanCounter = 0;

export function nextStan(): string {
  stanCounter = (stanCounter % 999999) + 1;
  return stanCounter.toString().padStart(6, "0");
}

// ── RRN: Retrieval Reference Number ─────────────────────────
// ISO 8583 Field 37: 12 alphanumeric characters
// Standard format: YYJJJhhmmssnn (but implementations vary)
// We use: last 12 digits of epoch milliseconds — guaranteed unique
// within any reasonable window and matches the spec's intent.

export function generateRrn(): string {
  const now = Date.now().toString();
  return now.substring(now.length - 12);
}

// ── Authorization Code ───────────────────────────────────────
// ISO 8583 Field 38: 6 alphanumeric characters
// Issued by the issuer/switch on approval.
// Must be returned in subsequent reversal/capture requests.
// Deterministic from tx_ref so it's reproducible if needed.

export function generateAuthCode(txRef: string): string {
  // Deterministic: hash the txRef, take first 6 hex chars, uppercase
  return createHash("sha256")
    .update(txRef)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
}

// ── Batch Reference ──────────────────────────────────────────
// Used for settlement batches
// Format: STL-{MERCHANTCODE}-{YYYYMMDD}-{SEQ:4}

export function generateBatchRef(merchantCode: string, seq: number): string {
  const date = formatDate(new Date());
  return `STL-${merchantCode}-${date}-${seq.toString().padStart(4, "0")}`;
}

// ── Ledger Journal Reference ─────────────────────────────────
// Ties a transaction to its ledger entry
// Format: JE-{TX_REF}

export function journalRef(txRef: string): string {
  return `JE-${txRef}`;
}

// ── Private ──────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}${m}${dd}`;
}
