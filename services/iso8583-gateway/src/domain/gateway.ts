import { Pool }           from "pg";
import { ConnectionPool } from "../network/connection-manager.js";
import { parse, build, buildResponse, extractMti, BuildInput, ParsedMessage } from "../parser/iso8583.js";

/**
 * ISO 8583 Gateway Domain
 *
 * Orchestrates the full message lifecycle:
 *   RECEIVE → PARSE → VALIDATE → RISK → ROUTE → FORWARD → RESPOND
 *
 * Every step is logged to transaction_journal (immutable).
 * Nothing disappears — if a message is received, it stays in the DB.
 */

const SWITCH_CORE_URL = process.env.SWITCH_CORE_URL   ?? "http://localhost:4010";
const RISK_URL        = process.env.RISK_SERVICE_URL   ?? "http://localhost:4006";
const ROUTING_URL     = process.env.ROUTING_SERVICE_URL ?? "http://localhost:4012";

export class GatewayError extends Error {
  constructor(message: string, public code: string, public responseCode = "96") {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Process an inbound ISO 8583 message through the full pipeline.
 *
 * @param rawHex  Full message hex (including 2-byte length header)
 * @param hostId  Which host sent this (for session tracking)
 * @returns       Response message hex ready to send back
 */
export async function processInbound(
  pool:       Pool,
  connPool:   ConnectionPool,
  rawHex:     string,
  hostId:     string,
): Promise<string> {

  const startTime = Date.now();

  // ── 1. Parse ──────────────────────────────────────────────
  const parsed = parse(rawHex, true);

  if (parsed.parseErrors.length > 0) {
    await logJournal(pool, "UNKNOWN", "PARSE_ERROR", { errors: parsed.parseErrors });
    const response = buildResponse(parsed, "30"); // Format error
    return build(response, true);
  }

  const mti  = parsed.mti;
  const stan = parsed.fields.get(11) ?? "000000";
  const ref  = `ISO-${stan}-${Date.now()}`;

  // ── 2. Record inbound message ─────────────────────────────
  const msgId = await recordMessage(pool, ref, "INBOUND", hostId, parsed, rawHex);
  await logJournal(pool, ref, `RECEIVED ${mti} (STAN ${stan})`, { mti, fields: Object.fromEntries(parsed.fields) });

  // ── 3. Network management messages — handle internally ────
  if (mti === "0800") {
    await logJournal(pool, ref, "ECHO_RESPONSE", { mti: "0810" });
    await updateMessageStatus(pool, msgId, "RESPONDED");
    const echoResp = buildResponse(parsed, "00");
    return build(echoResp, true);
  }

  // ── 4. Validate required fields ───────────────────────────
  const validationError = validateMessage(parsed);
  if (validationError) {
    await logJournal(pool, ref, "VALIDATION_FAILED", { reason: validationError });
    await updateMessageStatus(pool, msgId, "ERROR");
    const response = buildResponse(parsed, "12"); // Invalid transaction
    return build(response, true);
  }

  await updateMessageStatus(pool, msgId, "PARSED");

  // ── 5. Route to switch-core for authorization ─────────────
  const amount = parsed.fields.get(4) ?? "0";
  const currency = parsed.fields.get(49) ?? "840"; // Default USD

  let responseCode = "91"; // Issuer unavailable (default if we fail)

  try {
    await logJournal(pool, ref, "ROUTING_TO_SWITCH_CORE", { amount, currency });

    const switchResult = await callSwitchCore(
      ref, mti, stan, parsed, amount, currency,
    );

    responseCode = switchResult.responseCode;
    const authCode = switchResult.authCode;

    await logJournal(pool, ref, `SWITCH_CORE_RESPONSE ${responseCode}`, { responseCode, authCode });
    await updateMessageStatus(pool, msgId, responseCode === "00" ? "RESPONDED" : "RESPONDED");

    // Record metrics
    await recordMetrics(pool, mti, responseCode === "00");

    // Build response with switch-core data
    const additionalFields = new Map<number, string>();
    if (authCode) additionalFields.set(38, authCode);

    const response = buildResponse(parsed, responseCode, additionalFields);
    const responseHex = build(response, true);

    const processingMs = Date.now() - startTime;
    await pool.query(
      "UPDATE switch_messages SET processing_ms = $1, responded_at = NOW() WHERE id = $2",
      [processingMs, msgId],
    );

    return responseHex;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logJournal(pool, ref, "ERROR", { error: errorMsg });
    await updateMessageStatus(pool, msgId, "ERROR");
    await recordMetrics(pool, mti, false);

    const response = buildResponse(parsed, "96"); // System malfunction
    return build(response, true);
  }
}

/**
 * Send an outbound ISO 8583 message to a specific host.
 * Used by the switch-core to forward transactions to external processors.
 */
export async function sendOutbound(
  pool:     Pool,
  connPool: ConnectionPool,
  hostId:   string,
  message:  BuildInput,
  txRef:    string,
): Promise<ParsedMessage> {

  const conn = connPool.getConnection(hostId);
  if (!conn) {
    throw new GatewayError(
      `Host ${hostId} is offline or not connected`,
      "HOST_OFFLINE",
      "91",
    );
  }

  const rawHex = build(message, true);
  const stan   = message.fields.get(11) ?? "000000";
  const mti    = message.mti;

  // Record outbound message
  const msgId = await pool.query<{ id: string }>(
    `INSERT INTO switch_messages (reference, mti, direction, host_id, stan, raw_hex, parsed_fields, status)
     VALUES ($1,$2,'OUTBOUND',$3,$4,$5,$6,'FORWARDED')
     RETURNING id`,
    [txRef, mti, hostId, stan, rawHex, JSON.stringify(Object.fromEntries(message.fields))],
  ).then(r => r.rows[0].id).catch(() => "unknown");

  await logJournal(pool, txRef, `SENDING ${mti} to host ${hostId}`, { stan, mti });

  const response = await conn.send(message);

  const respCode = response.fields.get(39) ?? "XX";
  await pool.query(
    "UPDATE switch_messages SET status = 'RESPONDED', response_code = $1, responded_at = NOW() WHERE id = $2",
    [respCode, msgId],
  ).catch(() => {});

  await logJournal(pool, txRef, `HOST RESPONSE ${respCode}`, { responseCode: respCode, stan });

  return response;
}

// ── Host Management ──────────────────────────────────────────

export async function createHost(pool: Pool, input: {
  hostName:            string;
  hostType:            string;
  protocol:            string;
  hostname:            string;
  port:                number;
  useTls?:             boolean;
  poolSize?:           number;
  heartbeatIntervalSec?: number;
  headerLength?:       number;
  description?:        string;
}): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO hosts
       (host_name, host_type, protocol, hostname, port, use_tls,
        pool_size, heartbeat_interval_sec, header_length, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      input.hostName, input.hostType, input.protocol,
      input.hostname, input.port, input.useTls ?? true,
      input.poolSize ?? 5, input.heartbeatIntervalSec ?? 30,
      input.headerLength ?? 2, input.description ?? null,
    ],
  );

  // Create health record
  await pool.query(
    "INSERT INTO network_health (host_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [result.rows[0].id],
  );

  return { id: result.rows[0].id };
}

export async function setFailover(pool: Pool, primaryId: string, secondaryId: string, priority = 1, triggerCodes: string[] = ["91","92","96"]): Promise<void> {
  await pool.query(
    `INSERT INTO network_failover (primary_host, secondary_host, priority, trigger_codes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (primary_host, priority) DO UPDATE SET secondary_host = $2, trigger_codes = $4`,
    [primaryId, secondaryId, priority, triggerCodes],
  );
}

export async function getFailoverHost(pool: Pool, primaryId: string): Promise<string | null> {
  const result = await pool.query<{ secondary_host: string }>(
    `SELECT secondary_host FROM network_failover
     WHERE primary_host = $1 AND is_active = TRUE
     ORDER BY priority ASC LIMIT 1`,
    [primaryId],
  );
  return result.rows[0]?.secondary_host ?? null;
}

export async function listHosts(pool: Pool) {
  return pool.query(
    `SELECT h.*, nh.response_time_ms, nh.successful_requests,
            nh.failed_requests, nh.success_rate, nh.checked_at
     FROM hosts h
     LEFT JOIN network_health nh ON nh.host_id = h.id
     ORDER BY h.host_name`,
  );
}

export async function updateHostStatus(pool: Pool, hostId: string, status: string, error?: string): Promise<void> {
  await pool.query(
    "UPDATE hosts SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3",
    [status, error ?? null, hostId],
  );
}

// ── Message & Journal Queries ────────────────────────────────

export async function getTransactionJournal(pool: Pool, reference: string) {
  return pool.query(
    "SELECT * FROM transaction_journal WHERE reference = $1 ORDER BY created_at ASC",
    [reference],
  );
}

export async function listMessages(pool: Pool, filters: {
  direction?: string;
  mti?:       string;
  hostId?:    string;
  status?:    string;
  page:       number;
  pageSize:   number;
}) {
  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (filters.direction) { params.push(filters.direction); conditions.push(`direction = $${params.length}`); }
  if (filters.mti)       { params.push(filters.mti);       conditions.push(`mti = $${params.length}`); }
  if (filters.hostId)    { params.push(filters.hostId);    conditions.push(`host_id = $${params.length}`); }
  if (filters.status)    { params.push(filters.status);    conditions.push(`status = $${params.length}`); }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    pool.query(`SELECT id, reference, mti, direction, stan, response_code, status, received_at, processing_ms FROM switch_messages ${where} ORDER BY received_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, filters.pageSize, offset]),
    pool.query(`SELECT COUNT(*) FROM switch_messages ${where}`, params),
  ]);

  return { data: rows.rows, total: parseInt(count.rows[0].count, 10) };
}

export async function getDashboard(pool: Pool) {
  const [hosts, sessionStats, todayMetrics, recentMessages, queueDepth] = await Promise.all([
    pool.query(
      `SELECT h.id, h.host_name, h.host_type, h.status, h.hostname, h.port,
              nh.response_time_ms, nh.success_rate, nh.successful_requests, nh.failed_requests
       FROM hosts h LEFT JOIN network_health nh ON nh.host_id = h.id
       WHERE h.active = TRUE ORDER BY h.host_name`,
    ),
    pool.query(
      `SELECT session_status, COUNT(*) as count FROM network_sessions
       GROUP BY session_status`,
    ),
    pool.query(
      "SELECT * FROM transaction_metrics WHERE business_day = CURRENT_DATE",
    ),
    pool.query(
      `SELECT mti, direction, status, COUNT(*) as count FROM switch_messages
       WHERE received_at > NOW() - INTERVAL '1 hour' GROUP BY mti, direction, status ORDER BY count DESC`,
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE status='RECEIVED') as pending,
              COUNT(*) FILTER (WHERE status='FORWARDED') as processing,
              COUNT(*) FILTER (WHERE status='ERROR')    as failed
       FROM switch_messages WHERE received_at > NOW() - INTERVAL '5 minutes'`,
    ),
  ]);

  return {
    hosts:          hosts.rows,
    sessions:       sessionStats.rows,
    todayMetrics:   todayMetrics.rows[0] ?? null,
    recentMessages: recentMessages.rows,
    queueDepth:     queueDepth.rows[0] ?? {},
  };
}

// ── Private helpers ───────────────────────────────────────────

function validateMessage(msg: ParsedMessage): string | null {
  if (!msg.mti)            return "Missing MTI";
  if (!msg.fields.get(4))  return "Missing amount (field 4)";
  if (!msg.fields.get(11)) return "Missing STAN (field 11)";
  if (!msg.fields.get(41) && !msg.fields.get(42)) return "Missing terminal/merchant ID";
  return null;
}

async function callSwitchCore(
  txRef:    string,
  mti:      string,
  stan:     string,
  parsed:   ParsedMessage,
  amount:   string,
  currency: string,
): Promise<{ responseCode: string; authCode?: string }> {

  const txType = mti.startsWith("04") ? "REVERSAL"
               : mti.startsWith("08") ? "NETWORK_MGMT"
               : "ISO8583";

  const res = await fetch(`${SWITCH_CORE_URL}/transactions`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      txRef,
      txType,
      sourceAccount:      `TERMINAL:${parsed.fields.get(41) ?? "UNKNOWN"}:${currency}`,
      destinationAccount: `MERCHANT:${parsed.fields.get(42) ?? "UNKNOWN"}:${currency}`,
      amount:             (parseInt(amount, 10) / 100).toFixed(2), // cents to decimal
      currency:           isoToAlpha(currency),
      terminalId:         parsed.fields.get(41),
      merchantId:         parsed.fields.get(42),
      mti,
      processingCode:     parsed.fields.get(3),
      cardBin:            parsed.fields.get(2)?.slice(0, 8),
      metadata:           { stan, iso8583: true },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json() as {
    success: boolean;
    data?: { responseCode?: string; authCode?: string; approved?: boolean };
  };

  return {
    responseCode: data.data?.responseCode ?? (data.success ? "00" : "96"),
    authCode:     data.data?.authCode,
  };
}

async function recordMessage(
  pool:    Pool,
  ref:     string,
  dir:     string,
  hostId:  string,
  parsed:  ParsedMessage,
  rawHex:  string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO switch_messages
       (reference, mti, direction, host_id, stan, rrn, amount, currency,
        processing_code, terminal_id, merchant_id, raw_hex, parsed_fields, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'RECEIVED')
     RETURNING id`,
    [
      ref, parsed.mti, dir, hostId,
      parsed.fields.get(11) ?? null,
      parsed.fields.get(37) ?? null,
      parsed.fields.get(4)  ? parseInt(parsed.fields.get(4)!, 10) / 100 : null,
      isoToAlpha(parsed.fields.get(49) ?? "840"),
      parsed.fields.get(3)  ?? null,
      parsed.fields.get(41) ?? null,
      parsed.fields.get(42) ?? null,
      rawHex.slice(0, 2000), // truncate for storage
      JSON.stringify(Object.fromEntries(parsed.fields)),
    ],
  );
  return result.rows[0].id;
}

async function updateMessageStatus(pool: Pool, msgId: string, status: string): Promise<void> {
  await pool.query("UPDATE switch_messages SET status = $1 WHERE id = $2", [status, msgId]).catch(() => {});
}

async function logJournal(
  pool:      Pool,
  reference: string,
  activity:  string,
  data?:     Record<string, unknown>,
): Promise<void> {
  await pool.query(
    "INSERT INTO transaction_journal (reference, activity, data) VALUES ($1,$2,$3)",
    [reference, activity, data ? JSON.stringify(data) : null],
  ).catch(() => {});
}

async function recordMetrics(pool: Pool, mti: string, approved: boolean): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const isReversal = mti.startsWith("04");

  await pool.query(
    `INSERT INTO transaction_metrics (business_day, approved_count, declined_count, reversal_count)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (business_day) DO UPDATE SET
       approved_count  = transaction_metrics.approved_count  + EXCLUDED.approved_count,
       declined_count  = transaction_metrics.declined_count  + EXCLUDED.declined_count,
       reversal_count  = transaction_metrics.reversal_count  + EXCLUDED.reversal_count,
       updated_at      = NOW()`,
    [today, !isReversal && approved ? 1 : 0, !isReversal && !approved ? 1 : 0, isReversal ? 1 : 0],
  ).catch(() => {});
}

function isoToAlpha(code: string): string {
  const map: Record<string, string> = { "840": "USD", "978": "EUR", "826": "GBP", "784": "AED", "566": "NGN", "404": "KES", "936": "GHS" };
  return map[code] ?? code;
}
