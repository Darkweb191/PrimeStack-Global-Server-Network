import { Pool } from "pg";
import { randomUUID } from "crypto";

/**
 * Terminal Service Domain
 *
 * Manages the registry of payment terminals.
 *
 * Core responsibilities:
 *   1. Register and provision terminals
 *   2. Validate a terminal is eligible to process transactions
 *   3. Record heartbeats and health metrics
 *   4. Manage the remote command queue
 *   5. Track EMV parameters per terminal
 *
 * validate() is the critical path — it's called on every
 * transaction attempt. It must be fast (<10ms) and correct.
 * It uses a single indexed query. Results are NOT cached —
 * terminal status changes (suspension) must take effect immediately.
 */

export class TerminalError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "TerminalError";
  }
}

export interface TerminalRecord {
  id:              string;
  tid:             string;
  merchantId:      string;
  merchantCode:    string;
  merchantStatus:  string;
  serialNumber:    string;
  model:           string | null;
  firmwareVersion: string | null;
  country:         string;
  status:          string;
  lastSeenAt:      Date | null;
}

/**
 * Validate that a terminal may process a transaction.
 *
 * Returns the terminal record on success.
 * Throws TerminalError with a specific code on failure.
 * The response code maps to ISO 8583 field 39:
 *   TERMINAL_NOT_FOUND  → "57" (Transaction not permitted)
 *   TERMINAL_NOT_ACTIVE → "57"
 *   MERCHANT_SUSPENDED  → "57"
 */
export async function validate(
  pool: Pool,
  tid: string,
): Promise<TerminalRecord> {
  const result = await pool.query<{
    id:              string;
    tid:             string;
    merchant_id:     string;
    merchant_code:   string;
    merchant_status: string;
    serial_number:   string;
    model:           string | null;
    firmware_version: string | null;
    country:         string;
    status:          string;
    last_seen_at:    Date | null;
  }>(
    `SELECT
       t.id, t.tid, t.merchant_id, m.merchant_code, m.status AS merchant_status,
       t.serial_number, t.model, t.firmware_version, t.country, t.status, t.last_seen_at
     FROM terminals t
     JOIN merchants m ON m.id = t.merchant_id
     WHERE t.tid = $1`,
    [tid],
  );

  if (result.rows.length === 0) {
    throw new TerminalError(`Terminal not found: ${tid}`, "TERMINAL_NOT_FOUND");
  }

  const row = result.rows[0];

  if (row.status !== "ACTIVE") {
    throw new TerminalError(
      `Terminal ${tid} is ${row.status}`,
      "TERMINAL_NOT_ACTIVE",
    );
  }

  if (row.merchant_status !== "ACTIVE") {
    throw new TerminalError(
      `Merchant for terminal ${tid} is ${row.merchant_status}`,
      "MERCHANT_SUSPENDED",
    );
  }

  // Update last_seen_at asynchronously — don't await, don't block the caller
  pool.query(
    "UPDATE terminals SET last_seen_at = NOW() WHERE id = $1",
    [row.id],
  ).catch(() => { /* non-critical */ });

  return {
    id:              row.id,
    tid:             row.tid,
    merchantId:      row.merchant_id,
    merchantCode:    row.merchant_code,
    merchantStatus:  row.merchant_status,
    serialNumber:    row.serial_number,
    model:           row.model,
    firmwareVersion: row.firmware_version,
    country:         row.country,
    status:          row.status,
    lastSeenAt:      row.last_seen_at,
  };
}

/**
 * Register a new terminal.
 */
export async function register(
  pool: Pool,
  input: {
    tid:             string;
    merchantId:      string;
    serialNumber:    string;
    model?:          string;
    firmwareVersion?: string;
    country?:        string;
    timezone?:       string;
    locationLabel?:  string;
    publicKey?:      string;
  },
): Promise<{ id: string; tid: string }> {
  // Verify the merchant exists
  const merchant = await pool.query<{ id: string; status: string }>(
    "SELECT id, status FROM merchants WHERE id = $1",
    [input.merchantId],
  );

  if (merchant.rows.length === 0) {
    throw new TerminalError(`Merchant not found: ${input.merchantId}`, "MERCHANT_NOT_FOUND");
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO terminals
       (tid, merchant_id, serial_number, model, firmware_version, country,
        timezone, location_label, public_key, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'REGISTERED')
     ON CONFLICT (tid) DO NOTHING
     RETURNING id`,
    [
      input.tid,
      input.merchantId,
      input.serialNumber,
      input.model ?? null,
      input.firmwareVersion ?? null,
      input.country ?? "US",
      input.timezone ?? "UTC",
      input.locationLabel ?? null,
      input.publicKey ?? null,
    ],
  );

  if (result.rows.length === 0) {
    throw new TerminalError(`Terminal ID already exists: ${input.tid}`, "TID_CONFLICT");
  }

  const terminalId = result.rows[0].id;

  // Create the health record
  await pool.query(
    `INSERT INTO terminal_health (terminal_id, status)
     VALUES ($1, 'OFFLINE')
     ON CONFLICT (terminal_id) DO NOTHING`,
    [terminalId],
  );

  return { id: terminalId, tid: input.tid };
}

/**
 * Activate a registered terminal.
 */
export async function activate(pool: Pool, tid: string): Promise<void> {
  const result = await pool.query(
    `UPDATE terminals SET status = 'ACTIVE', updated_at = NOW()
     WHERE tid = $1 AND status = 'REGISTERED'`,
    [tid],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new TerminalError(
      `Terminal ${tid} not found or not in REGISTERED state`,
      "CANNOT_ACTIVATE",
    );
  }
}

/**
 * Record a terminal heartbeat with health metrics.
 */
export async function heartbeat(
  pool: Pool,
  tid: string,
  metrics: {
    cpuPct?:        number;
    memoryPct?:     number;
    diskPct?:       number;
    batteryPct?:    number;
    latencyMs?:     number;
    errorCode?:     string;
    errorMessage?:  string;
  },
): Promise<void> {
  // Look up terminal in single query
  const terminal = await pool.query<{ id: string }>(
    "SELECT id FROM terminals WHERE tid = $1",
    [tid],
  );

  if (terminal.rows.length === 0) return; // Unknown terminal — ignore

  const id = terminal.rows[0].id;
  const hasError = !!metrics.errorCode;

  await pool.query(
    `INSERT INTO terminal_health
       (terminal_id, status, heartbeat_at, cpu_usage_pct, memory_usage_pct,
        disk_usage_pct, battery_level_pct, network_latency_ms, error_code, error_message)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (terminal_id) DO UPDATE SET
       status             = EXCLUDED.status,
       heartbeat_at       = NOW(),
       cpu_usage_pct      = EXCLUDED.cpu_usage_pct,
       memory_usage_pct   = EXCLUDED.memory_usage_pct,
       disk_usage_pct     = EXCLUDED.disk_usage_pct,
       battery_level_pct  = EXCLUDED.battery_level_pct,
       network_latency_ms = EXCLUDED.network_latency_ms,
       error_code         = EXCLUDED.error_code,
       error_message      = EXCLUDED.error_message,
       updated_at         = NOW()`,
    [
      id,
      hasError ? "DEGRADED" : "ONLINE",
      metrics.cpuPct    ?? null,
      metrics.memoryPct ?? null,
      metrics.diskPct   ?? null,
      metrics.batteryPct ?? null,
      metrics.latencyMs ?? null,
      metrics.errorCode ?? null,
      metrics.errorMessage ?? null,
    ],
  );

  // Also update last_seen_at on the terminal
  await pool.query(
    "UPDATE terminals SET last_seen_at = NOW() WHERE id = $1",
    [id],
  );
}

/**
 * Queue a remote command for a terminal.
 * The terminal polls for pending commands on its next heartbeat.
 */
export async function queueCommand(
  pool: Pool,
  tid: string,
  command: string,
  payload?: Record<string, unknown>,
  expiresInMinutes = 60,
): Promise<{ commandId: string }> {
  const terminal = await pool.query<{ id: string }>(
    "SELECT id FROM terminals WHERE tid = $1",
    [tid],
  );

  if (terminal.rows.length === 0) {
    throw new TerminalError(`Terminal not found: ${tid}`, "TERMINAL_NOT_FOUND");
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO terminal_commands (terminal_id, command, payload, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL)
     RETURNING id`,
    [terminal.rows[0].id, command, payload ? JSON.stringify(payload) : null, expiresInMinutes],
  );

  return { commandId: result.rows[0].id };
}

/**
 * Poll for pending commands (called by terminal on heartbeat).
 */
export async function pollCommands(
  pool: Pool,
  tid: string,
): Promise<Array<{ commandId: string; command: string; payload: unknown }>> {
  const result = await pool.query<{ id: string; command: string; payload: unknown }>(
    `SELECT c.id, c.command, c.payload
     FROM terminal_commands c
     JOIN terminals t ON t.id = c.terminal_id
     WHERE t.tid = $1
       AND c.status = 'PENDING'
       AND c.expires_at > NOW()
     ORDER BY c.created_at ASC`,
    [tid],
  );

  // Mark commands as SENT
  if (result.rows.length > 0) {
    const ids = result.rows.map((r) => r.id);
    await pool.query(
      `UPDATE terminal_commands SET status = 'SENT', sent_at = NOW()
       WHERE id = ANY($1)`,
      [ids],
    );
  }

  return result.rows.map((r) => ({
    commandId: r.id,
    command:   r.command,
    payload:   r.payload,
  }));
}

/**
 * Acknowledge a command — terminal confirms it received and acted on it.
 */
export async function ackCommand(pool: Pool, commandId: string): Promise<void> {
  await pool.query(
    `UPDATE terminal_commands SET status = 'ACK', acked_at = NOW()
     WHERE id = $1 AND status = 'SENT'`,
    [commandId],
  );
}

/**
 * Get a terminal's full status for monitoring.
 */
export async function getStatus(pool: Pool, tid: string) {
  const result = await pool.query(
    `SELECT
       t.id, t.tid, t.serial_number, t.model, t.firmware_version,
       t.status AS terminal_status, t.last_seen_at, t.country,
       m.merchant_code, m.legal_name, m.status AS merchant_status,
       h.status AS health_status, h.heartbeat_at,
       h.cpu_usage_pct, h.memory_usage_pct, h.battery_level_pct,
       h.network_latency_ms, h.error_code, h.error_message
     FROM terminals t
     JOIN merchants m ON m.id = t.merchant_id
     LEFT JOIN terminal_health h ON h.terminal_id = t.id
     WHERE t.tid = $1`,
    [tid],
  );

  if (result.rows.length === 0) {
    throw new TerminalError(`Terminal not found: ${tid}`, "TERMINAL_NOT_FOUND");
  }

  return result.rows[0];
}
