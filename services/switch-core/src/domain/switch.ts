import { Pool }                              from "pg";
import { Decimal }                          from "decimal.js";
import { nextTxRef, nextStan, generateRrn, generateAuthCode, journalRef } from "../generators/references.js";
import { resolveResponseCode, getResponseInfo }                           from "../iso8583/response-codes.js";

/**
 * Switch Core Domain — Transaction Lifecycle Engine
 *
 * This is the heart of the payment switch. Every financial transaction
 * — regardless of type — flows through this pipeline:
 *
 *   RECEIVED
 *     ↓ authenticate()      — HMAC/API key validation
 *     ↓ validateTerminal()  — Terminal registered and ACTIVE
 *     ↓ checkRisk()         — Velocity, blacklist, AML
 *     ↓ validateBalance()   — Source account has sufficient funds
 *     ↓ createTransaction() — Insert PENDING record
 *     ↓ postToLedger()      — ONLY step that moves money
 *     ↓ approve()           — Mark APPROVED, generate auth_code
 *     ↓ enqueueSettlement() — Add to settlement queue
 *   APPROVED → response to caller
 *
 * Failure at any step:
 *   - Transaction is marked DECLINED or FAILED
 *   - ISO 8583 response code is set
 *   - No ledger change occurs (ledger is atomic)
 *   - Response returned immediately
 *
 * Idempotency:
 *   A duplicate tx_ref returns the existing transaction response
 *   without reprocessing. Safe to retry on network failures.
 *
 * Performance target: < 200ms end-to-end for approved transactions.
 *   - DB reads: ~10ms
 *   - Risk service: ~20ms
 *   - Ledger post: ~30ms
 *   - Total with overhead: ~80–150ms
 */

export class SwitchError extends Error {
  constructor(
    message:         string,
    public code:     string,
    public responseCode: string = "05",
    public httpStatus: number  = 422,
  ) {
    super(message);
    this.name = "SwitchError";
  }
}

export interface TransactionRequest {
  txRef?:             string;   // caller-supplied idempotency key (optional — generated if absent)
  txType:             "T2T" | "S2S" | "WALLET" | "MERCHANT" | "AUTH_ONLY" | "CAPTURE" | "REFUND" | "ISO8583";
  sourceAccount:      string;   // ledger account code
  destinationAccount: string;   // ledger account code
  amount:             string;
  currency:           string;
  feeAmount?:         string;
  merchantId?:        string;
  terminalId?:        string;
  mti?:               string;   // ISO 8583 MTI (for terminal-originated)
  processingCode?:    string;   // ISO 8583 field 3
  cardBin?:           string;
  cardType?:          string;
  ipAddress?:         string;
  metadata?:          Record<string, unknown>;
}

export interface TransactionResponse {
  txRef:        string;
  stan:         string;
  rrn:          string;
  authCode?:    string;
  responseCode: string;
  responseMessage: string;
  approved:     boolean;
  amount:       string;
  currency:     string;
  processingTimeMs: number;
}

// Service URLs
const LEDGER_URL   = process.env.LEDGER_SERVICE_URL   ?? "http://localhost:4001";
const RISK_URL     = process.env.RISK_SERVICE_URL     ?? "http://localhost:4006";
const TERMINAL_URL = process.env.TERMINAL_SERVICE_URL ?? "http://localhost:4004";
const ROUTING_URL  = process.env.ROUTING_SERVICE_URL  ?? "http://localhost:4012";
const NOTIF_URL    = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4009";

/**
 * Process a transaction through the full switch pipeline.
 * Returns a structured response with ISO 8583 response code.
 */
export async function processTransaction(
  pool:    Pool,
  request: TransactionRequest,
): Promise<TransactionResponse> {

  const startTime = Date.now();
  const stan      = nextStan();
  const rrn       = generateRrn();
  const txRef     = request.txRef ?? await nextTxRef(pool);

  // ── Idempotency check ─────────────────────────────────────
  const existing = await pool.query<{
    tx_ref: string; stan: string; rrn: string; auth_code: string | null;
    response_code: string; status: string; amount: string; currency: string;
  }>(
    "SELECT tx_ref, stan, rrn, auth_code, response_code, status, amount::text, currency FROM transactions WHERE tx_ref = $1",
    [txRef],
  );

  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    const info = getResponseInfo(r.response_code ?? "05");
    return {
      txRef:            r.tx_ref,
      stan:             r.stan,
      rrn:              r.rrn,
      authCode:         r.auth_code ?? undefined,
      responseCode:     r.response_code,
      responseMessage:  info.message,
      approved:         info.approved,
      amount:           r.amount,
      currency:         r.currency,
      processingTimeMs: 0,
    };
  }

  const amount    = new Decimal(request.amount);
  const feeAmount = new Decimal(request.feeAmount ?? "0");

  // ── 1. Validate amounts ───────────────────────────────────
  if (amount.lte(0)) {
    return decline(pool, txRef, stan, rrn, request, "13", "Invalid amount", startTime);
  }
  if (feeAmount.lt(0) || feeAmount.gt(amount)) {
    return decline(pool, txRef, stan, rrn, request, "13", "Invalid fee", startTime);
  }

  // ── 2. Validate terminal (if T2T or ISO8583) ─────────────
  if (request.terminalId) {
    try {
      await callService(`${TERMINAL_URL}/terminals/${request.terminalId}/validate`, "GET");
    } catch (err) {
      const code = extractErrorCode(err);
      return decline(pool, txRef, stan, rrn, request, resolveResponseCode(code), String(err), startTime);
    }
  }

  // ── 3. Risk evaluation ────────────────────────────────────
  let riskScore   = 0;
  let riskVerdict = "ALLOW";

  try {
    const riskResult = await callService<{
      verdict: string; riskScore: number; riskLevel: string; reason?: string;
    }>(`${RISK_URL}/evaluate`, "POST", {
      entityRef:   txRef,
      entityType:  "TRANSACTION",
      amount:      amount.toString(),
      currency:    request.currency,
      merchantId:  request.merchantId,
      ipAddress:   request.ipAddress,
    });

    riskScore   = riskResult.riskScore;
    riskVerdict = riskResult.verdict;

    if (riskResult.verdict === "BLOCK") {
      return decline(pool, txRef, stan, rrn, request, "34", riskResult.reason ?? "Blocked by risk engine", startTime, riskScore, riskVerdict);
    }
  } catch {
    // Risk service unavailable — continue with elevated risk score (fail open)
    riskScore   = 50;
    riskVerdict = "REVIEW";
  }

  // ── 4. Create PENDING transaction record ─────────────────
  const txId = await createPendingTransaction(pool, {
    txRef, stan, rrn, request, amount, feeAmount, riskScore, riskVerdict,
  });

  await logEvent(pool, txId, "RISK_EVALUATED", "PENDING", "PENDING", `score=${riskScore} verdict=${riskVerdict}`);

  // ── 5. Routing Engine — where does this transaction go? ───
  // Authentication → Risk → ROUTING → Ledger → Settlement
  let routeId: string | undefined;

  try {
    const routeResult = await callService<{
      routeId:    string;
      routeName:  string;
      routeType:  string;
      destination: string;
      protocol:   string | null;
    }>(`${ROUTING_URL}/route`, "POST", {
      txRef,
      txType:      request.txType,
      amount:      amount.toString(),
      currency:    request.currency,
      merchantId:  request.merchantId,
      terminalId:  request.terminalId,
      cardBin:     request.cardBin,
      cardNetwork: request.cardType,
    });

    routeId = routeResult.routeId;

    await logEvent(pool, txId, "ROUTED", "PENDING", "PENDING",
      `route=${routeResult.routeName} type=${routeResult.routeType} dest=${routeResult.destination}`);

  } catch (err) {
    // Routing service unavailable or no route found
    const code = extractErrorCode(err);
    if (code === "NO_ROUTE") {
      // ISO 8583 code 92: unable to route
      await failTransaction(pool, txId, "92", "No route found for this transaction");
      await logEvent(pool, txId, "ROUTING_FAILED", "PENDING", "FAILED", "NO_ROUTE");
      return buildResponse(txRef, stan, rrn, undefined, "92", false, amount.toString(), request.currency, startTime, "Unable to route transaction");
    }
    // Routing service down — log but continue (fail open for internal routes)
    await logEvent(pool, txId, "ROUTING_SKIPPED", "PENDING", "PENDING", String(err));
  }

  // Update transaction with route
  if (routeId) {
    await pool.query("UPDATE transactions SET route_id = $1 WHERE id = $2", [routeId, txId]);
  }

  // ── 6. Post to Ledger (THE money movement) ────────────────
  const jeRef = journalRef(txRef);
  const netAmount = amount.minus(feeAmount);

  const lines: Array<{ accountId: string; debit: string; credit: string }> = [
    { accountId: request.sourceAccount,      debit: amount.toString(),    credit: "0" },
    { accountId: request.destinationAccount, debit: "0",                  credit: netAmount.toString() },
  ];

  if (feeAmount.gt(0)) {
    lines.push({ accountId: `FEE-${request.txType}-${request.currency}`, debit: "0", credit: feeAmount.toString() });
  }

  try {
    await callService(`${LEDGER_URL}/entries`, "POST", {
      reference:   jeRef,
      entryType:   "TRANSFER",
      description: `${request.txType} transaction ${txRef}`,
      source:      "SWITCH_CORE",
      postedBy:    request.merchantId ?? "switch-core",
      lines,
    });
  } catch (err) {
    const code = extractErrorCode(err);
    const rc   = resolveResponseCode(code);
    await failTransaction(pool, txId, rc, String(err));
    await logEvent(pool, txId, "LEDGER_FAILED", "PENDING", "FAILED", String(err));

    return buildResponse(txRef, stan, rrn, undefined, rc, false, amount.toString(), request.currency, startTime);
  }

  await logEvent(pool, txId, "LEDGER_POSTED", "PENDING", "PENDING", `journal_ref=${jeRef}`);

  // Notify routing service of successful outcome (for health stats)
  if (routeId) {
    callService(`${ROUTING_URL}/routes/${routeId}/health`, "POST", {
      success: true, responseMs: Date.now() - startTime,
    }).catch(() => {});
  }

  // ── 6. Approve transaction ────────────────────────────────
  const authCode = generateAuthCode(txRef);

  await pool.query(
    `UPDATE transactions SET
       status            = 'APPROVED',
       auth_code         = $1,
       rrn               = $2,
       response_code     = '00',
       response_message  = 'Approved',
       journal_entry_ref = $3,
       processed_at      = NOW(),
       processing_time_ms = $4,
       risk_score        = $5,
       risk_verdict      = $6
     WHERE id = $7`,
    [authCode, rrn, jeRef, Date.now() - startTime, riskScore, riskVerdict, txId],
  );

  // ── 7. Enqueue for settlement ─────────────────────────────
  if (request.merchantId) {
    await pool.query(
      `INSERT INTO settlement_queue (tx_ref, merchant_id, amount, fee_amount, currency)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [txRef, request.merchantId, amount.toString(), feeAmount.toString(), request.currency],
    );
  }

  // ── 8. Fire notification (non-blocking) ──────────────────
  callService(`${NOTIF_URL}/events`, "POST", {
    event:      "transaction.approved",
    payload:    { txRef, amount: amount.toString(), currency: request.currency, authCode },
    merchantId: request.merchantId,
  }).catch(() => { /* non-critical */ });

  const processingTimeMs = Date.now() - startTime;

  return {
    txRef,
    stan,
    rrn,
    authCode,
    responseCode:     "00",
    responseMessage:  "Approved",
    approved:         true,
    amount:           amount.toString(),
    currency:         request.currency,
    processingTimeMs,
  };
}

/**
 * Reverse an APPROVED transaction.
 * Calls the Ledger Service to reverse the journal entry.
 * Returns a reversal response with ISO 8583 response code.
 */
export async function reverseTransaction(
  pool:         Pool,
  originalTxRef: string,
  reason:        string,
  reversedBy?:   string,
): Promise<TransactionResponse> {

  const startTime = Date.now();

  const result = await pool.query<{
    id: string; stan: string; rrn: string; status: string;
    journal_entry_ref: string | null; amount: string; currency: string;
  }>(
    "SELECT id, stan, rrn, status, journal_entry_ref, amount::text, currency FROM transactions WHERE tx_ref = $1",
    [originalTxRef],
  );

  if (result.rows.length === 0) {
    return buildResponse(originalTxRef, nextStan(), generateRrn(), undefined, "25", false, "0", "USD", startTime);
  }

  const tx = result.rows[0];

  if (tx.status !== "APPROVED") {
    const rc = tx.status === "REVERSED" ? "79" : "57";
    return buildResponse(originalTxRef, nextStan(), tx.rrn, undefined, rc, false, tx.amount, tx.currency, startTime);
  }

  if (!tx.journal_entry_ref) {
    return buildResponse(originalTxRef, nextStan(), tx.rrn, undefined, "96", false, tx.amount, tx.currency, startTime);
  }

  // Reverse in the ledger
  try {
    await callService(`${LEDGER_URL}/entries/${tx.journal_entry_ref}/reverse`, "POST", {
      reason,
      reversedBy: reversedBy ?? "switch-core",
    });
  } catch (err) {
    return buildResponse(originalTxRef, nextStan(), tx.rrn, undefined, "96", false, tx.amount, tx.currency, startTime);
  }

  // Mark transaction reversed
  const reversalStan = nextStan();
  const reversalRrn  = generateRrn();

  await pool.query(
    `UPDATE transactions SET
       status = 'REVERSED',
       updated_at = NOW()
     WHERE id = $1`,
    [tx.id],
  );

  await logEvent(pool, tx.id, "REVERSED", "APPROVED", "REVERSED", reason);

  // Remove from settlement queue
  await pool.query(
    "UPDATE settlement_queue SET status = 'FAILED' WHERE tx_ref = $1 AND status = 'PENDING'",
    [originalTxRef],
  );

  return buildResponse(originalTxRef, reversalStan, reversalRrn, undefined, "00", true, tx.amount, tx.currency, startTime, "Reversal approved");
}

/**
 * Get a transaction by tx_ref.
 */
export async function getTransaction(pool: Pool, txRef: string) {
  const result = await pool.query(
    `SELECT t.*, te.event_type, te.created_at as event_time
     FROM transactions t
     LEFT JOIN transaction_events te ON te.tx_id = t.id
     WHERE t.tx_ref = $1
     ORDER BY te.created_at ASC`,
    [txRef],
  );

  if (result.rows.length === 0) {
    throw new SwitchError(`Transaction not found: ${txRef}`, "NOT_FOUND", "25", 404);
  }

  const tx     = result.rows[0];
  const events = result.rows.map((r) => ({
    eventType:  r.event_type,
    createdAt:  r.event_time,
  })).filter((e) => e.eventType);

  return { ...tx, events };
}

/**
 * List transactions with filters and pagination.
 */
export async function listTransactions(
  pool:    Pool,
  filters: {
    status?:     string;
    txType?:     string;
    merchantId?: string;
    terminalId?: string;
    cardBin?:    string;
    from?:       Date;
    to?:         Date;
    page:        number;
    pageSize:    number;
  },
) {
  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (filters.status)     { params.push(filters.status);     conditions.push(`status = $${params.length}`); }
  if (filters.txType)     { params.push(filters.txType);     conditions.push(`tx_type = $${params.length}`); }
  if (filters.merchantId) { params.push(filters.merchantId); conditions.push(`merchant_id = $${params.length}`); }
  if (filters.terminalId) { params.push(filters.terminalId); conditions.push(`terminal_id = $${params.length}`); }
  if (filters.cardBin)    { params.push(filters.cardBin);    conditions.push(`card_bin = $${params.length}`); }
  if (filters.from)       { params.push(filters.from);       conditions.push(`received_at >= $${params.length}`); }
  if (filters.to)         { params.push(filters.to);         conditions.push(`received_at <= $${params.length}`); }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT id, tx_ref, stan, rrn, auth_code, tx_type, status, amount, currency,
              fee_amount, merchant_id, terminal_id, response_code, response_message,
              processing_time_ms, risk_score, received_at, processed_at
       FROM transactions ${where}
       ORDER BY received_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, filters.pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params),
  ]);

  return {
    data:     rows.rows,
    total:    parseInt(count.rows[0].count, 10),
    page:     filters.page,
    pageSize: filters.pageSize,
  };
}

// ── Private helpers ─────────────────────────────────────────

async function createPendingTransaction(
  pool: Pool,
  args: {
    txRef:       string;
    stan:        string;
    rrn:         string;
    request:     TransactionRequest;
    amount:      Decimal;
    feeAmount:   Decimal;
    riskScore:   number;
    riskVerdict: string;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO transactions
       (tx_ref, stan, rrn, tx_type, status,
        source_account, destination_account,
        amount, currency, fee_amount,
        merchant_id, terminal_id,
        mti, processing_code, card_bin, card_type,
        risk_score, risk_verdict,
        raw_request, received_at)
     VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
     RETURNING id`,
    [
      args.txRef,
      args.stan,
      args.rrn,
      args.request.txType,
      args.request.sourceAccount,
      args.request.destinationAccount,
      args.amount.toString(),
      args.request.currency.toUpperCase(),
      args.feeAmount.toString(),
      args.request.merchantId     ?? null,
      args.request.terminalId     ?? null,
      args.request.mti            ?? null,
      args.request.processingCode ?? null,
      args.request.cardBin        ?? null,
      args.request.cardType       ?? null,
      args.riskScore,
      args.riskVerdict,
      args.request.metadata ? JSON.stringify(args.request.metadata) : null,
    ],
  );
  return result.rows[0].id;
}

async function failTransaction(
  pool:            Pool,
  txId:            string,
  responseCode:    string,
  responseMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE transactions SET
       status = 'FAILED',
       response_code = $1,
       response_message = $2,
       processed_at = NOW()
     WHERE id = $3`,
    [responseCode, responseMessage, txId],
  );
}

async function decline(
  pool:            Pool,
  txRef:           string,
  stan:            string,
  rrn:             string,
  request:         TransactionRequest,
  responseCode:    string,
  reason:          string,
  startTime:       number,
  riskScore?:      number,
  riskVerdict?:    string,
): Promise<TransactionResponse> {

  await pool.query(
    `INSERT INTO transactions
       (tx_ref, stan, rrn, tx_type, status,
        source_account, destination_account,
        amount, currency, fee_amount,
        merchant_id, terminal_id,
        response_code, response_message,
        risk_score, risk_verdict, processed_at)
     VALUES ($1,$2,$3,$4,'DECLINED',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
     ON CONFLICT (tx_ref) DO NOTHING`,
    [
      txRef, stan, rrn, request.txType,
      request.sourceAccount, request.destinationAccount,
      request.amount, request.currency.toUpperCase(), request.feeAmount ?? "0",
      request.merchantId ?? null, request.terminalId ?? null,
      responseCode, reason,
      riskScore ?? null, riskVerdict ?? null,
    ],
  );

  return buildResponse(txRef, stan, rrn, undefined, responseCode, false, request.amount, request.currency, startTime, reason);
}

function buildResponse(
  txRef:           string,
  stan:            string,
  rrn:             string,
  authCode:        string | undefined,
  responseCode:    string,
  approved:        boolean,
  amount:          string,
  currency:        string,
  startTime:       number,
  overrideMessage?: string,
): TransactionResponse {
  const info = getResponseInfo(responseCode);
  return {
    txRef,
    stan,
    rrn,
    authCode,
    responseCode,
    responseMessage:  overrideMessage ?? info.message,
    approved,
    amount,
    currency,
    processingTimeMs: Date.now() - startTime,
  };
}

async function logEvent(
  pool:        Pool,
  txId:        string,
  eventType:   string,
  fromStatus:  string,
  toStatus:    string,
  description?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO transaction_events (tx_id, event_type, from_status, to_status, description, performed_by)
     VALUES ($1,$2,$3,$4,$5,'switch-core')`,
    [txId, eventType, fromStatus, toStatus, description ?? null],
  );
}

async function callService<T = unknown>(
  url:       string,
  method:    "GET" | "POST",
  body?:     object,
  timeoutMs = 8_000,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body:    body ? JSON.stringify(body) : undefined,
    signal:  AbortSignal.timeout(timeoutMs),
  });

  const data = await res.json() as { success: boolean; data?: T; error?: { code: string; message: string } };

  if (!data.success) {
    const code = data.error?.code ?? "SERVICE_ERROR";
    const msg  = data.error?.message ?? "Service call failed";
    throw new SwitchError(msg, code, resolveResponseCode(code));
  }

  return data.data as T;
}

function extractErrorCode(err: unknown): string {
  if (err instanceof SwitchError) return err.code;
  if (err instanceof Error && err.message.includes("[")) {
    const match = err.message.match(/\[(\w+)\]/);
    if (match) return match[1];
  }
  return "UNKNOWN";
}
