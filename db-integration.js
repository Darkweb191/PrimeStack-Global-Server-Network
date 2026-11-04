/**
 * PrimeStack — Deutsche Bank API Integration
 *
 * OAuth2 + mTLS certificate authentication
 * RFC 8259 JSON format throughout
 *
 * Handles:
 *   - OAuth2 token acquisition (client_credentials)
 *   - Account balance queries
 *   - Transaction history
 *   - Payment initiation
 *   - Incoming transfer notifications → platform ledger credit
 *
 * Setup:
 *   1. Add DB_CLIENT_ID, DB_CLIENT_SECRET, DB_API_KEY to .env
 *   2. Place your mTLS certificate files, set DB_CERT_PATH etc.
 *   3. node db-integration.js
 */

import { createServer } from "http";
import { readFileSync }  from "fs";

// ── Config ─────────────────────────────────────────────────────
const DB_TOKEN_URL     = process.env.DB_TOKEN_URL     || "https://api.db.com/oneid/am/oauth2/realms/root/realms/consumer/access_token";
const DB_API_BASE      = process.env.DB_API_BASE      || "https://api.db.com";
const DB_CLIENT_ID     = process.env.DB_CLIENT_ID     || "";
const DB_CLIENT_SECRET = process.env.DB_CLIENT_SECRET || "";
const DB_API_KEY       = process.env.DB_API_KEY       || "";
const DB_SCOPE         = process.env.DB_SCOPE         || "read_accounts read_transactions";
const DB_CERT_PATH     = process.env.DB_CERT_PATH     || "";
const DB_KEY_PATH      = process.env.DB_KEY_PATH      || "";
const DB_CA_PATH       = process.env.DB_CA_PATH       || "";
const DB_ENV           = process.env.DB_ENV           || "sandbox";
const DASHBOARD_URL    = process.env.DASHBOARD_URL    || "http://localhost:8081";
const PORT             = parseInt(process.env.DB_PORT || "8083", 10);

// ── Token cache ─────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

// ── HTTP helpers ────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ── Build fetch options with mTLS if certs are configured ───────
function buildFetchOptions(method = "GET", body = null, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  };
  if (body) opts.body = typeof body === "string" ? body : JSON.stringify(body);

  // mTLS — attach certificate if paths are configured
  if (DB_CERT_PATH && DB_KEY_PATH) {
    try {
      opts.cert = readFileSync(DB_CERT_PATH);
      opts.key  = readFileSync(DB_KEY_PATH);
      if (DB_CA_PATH) opts.ca = readFileSync(DB_CA_PATH);
    } catch (e) {
      console.warn("[db] Certificate load failed:", e.message);
    }
  }
  return opts;
}

// ── OAuth2 token acquisition ─────────────────────────────────────
async function getAccessToken() {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }

  if (!DB_CLIENT_ID || !DB_CLIENT_SECRET) {
    throw new Error("DB_CLIENT_ID and DB_CLIENT_SECRET not configured in .env");
  }

  // RFC 8259 compliant — application/x-www-form-urlencoded for OAuth2
  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     DB_CLIENT_ID,
    client_secret: DB_CLIENT_SECRET,
    scope:         DB_SCOPE,
  });

  const opts = buildFetchOptions("POST", null, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
  opts.body = body.toString();
  delete opts.headers["Content-Type"];
  opts.headers["Content-Type"] = "application/x-www-form-urlencoded";

  if (DB_API_KEY) {
    opts.headers["apikey"] = DB_API_KEY;
    opts.headers["X-API-Key"] = DB_API_KEY;
  }

  const res = await fetch(DB_TOKEN_URL, opts);
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Token response not JSON: ${text.substring(0, 200)}`); }

  if (!res.ok) {
    throw new Error(`Token request failed ${res.status}: ${JSON.stringify(data)}`);
  }

  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  console.log(`[db] Token acquired. Expires in ${data.expires_in || 3600}s`);
  return cachedToken;
}

// ── Authenticated DB API call ────────────────────────────────────
async function dbGet(path) {
  const token = await getAccessToken();
  const opts  = buildFetchOptions("GET", null, {
    "Authorization": `Bearer ${token}`,
    ...(DB_API_KEY ? { "apikey": DB_API_KEY } : {}),
  });
  const res  = await fetch(`${DB_API_BASE}${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: { raw: text } }; }
}

async function dbPost(path, body) {
  const token = await getAccessToken();
  const opts  = buildFetchOptions("POST", body, {
    "Authorization": `Bearer ${token}`,
    ...(DB_API_KEY ? { "apikey": DB_API_KEY } : {}),
  });
  const res  = await fetch(`${DB_API_BASE}${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: { raw: text } }; }
}

// ── Platform ledger helper ───────────────────────────────────────
async function postLedgerEntry(ref, debitAccount, creditAccount, amount, currency, description, metadata) {
  try {
    const r = await fetch(`${DASHBOARD_URL}/api/wallets/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: ref,
        entryType: "FUNDING",
        description,
        metadata: { ...metadata, source: "db_integration" },
        lines: [
          { accountId: debitAccount,  debit: String(amount), credit: "0.00" },
          { accountId: creditAccount, debit: "0.00",         credit: String(amount) },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    return r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function postAudit(eventType, description, metadata) {
  try {
    await fetch(`${DASHBOARD_URL}/api/audit/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorType: "SYSTEM", eventType, description, actorId: "db-integration", metadata }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-critical */ }
}

// ── HTTP Server ──────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end(); return;
  }

  const [path] = (req.url || "/").split("?");

  // ── Health ────────────────────────────────────────────────────
  if (path === "/health") {
    return json(res, 200, {
      status:      "ok",
      service:     "db-integration",
      env:         DB_ENV,
      configured:  !!(DB_CLIENT_ID && DB_CLIENT_SECRET),
      hasCert:     !!(DB_CERT_PATH),
      tokenCached: !!cachedToken,
    });
  }

  // ── Test token ────────────────────────────────────────────────
  if (req.method === "POST" && path === "/db/token") {
    try {
      const token = await getAccessToken();
      return json(res, 200, { success: true, data: { tokenAcquired: true, expiresAt: new Date(tokenExpiresAt).toISOString(), tokenPreview: token.substring(0, 20) + "…" } });
    } catch (e) {
      return json(res, 502, { success: false, error: e.message });
    }
  }

  // ── Get accounts ──────────────────────────────────────────────
  if (req.method === "GET" && path === "/db/accounts") {
    try {
      const r = await dbGet("/v1/accounts");
      return json(res, r.ok ? 200 : 502, { success: r.ok, data: r.data });
    } catch (e) {
      return json(res, 502, { success: false, error: e.message });
    }
  }

  // ── Get account balance ───────────────────────────────────────
  const balMatch = path.match(/^\/db\/accounts\/([^/]+)\/balances$/);
  if (req.method === "GET" && balMatch) {
    try {
      const r = await dbGet(`/v1/accounts/${balMatch[1]}/balances`);
      return json(res, r.ok ? 200 : 502, { success: r.ok, data: r.data });
    } catch (e) {
      return json(res, 502, { success: false, error: e.message });
    }
  }

  // ── Get transactions ──────────────────────────────────────────
  const txMatch = path.match(/^\/db\/accounts\/([^/]+)\/transactions$/);
  if (req.method === "GET" && txMatch) {
    try {
      const r = await dbGet(`/v1/accounts/${txMatch[1]}/transactions`);
      return json(res, r.ok ? 200 : 502, { success: r.ok, data: r.data });
    } catch (e) {
      return json(res, 502, { success: false, error: e.message });
    }
  }

  // ── Initiate payment ──────────────────────────────────────────
  if (req.method === "POST" && path === "/db/payments") {
    const rawBody = await readBody(req);
    let body;
    try { body = JSON.parse(rawBody.toString()); }
    catch { return json(res, 400, { success: false, error: "Invalid JSON body" }); }

    const { amount, currency, creditorName, creditorIBAN, creditorBIC, reference, debtorIBAN } = body;

    if (!amount || !currency || !creditorIBAN || !creditorName) {
      return json(res, 422, { success: false, error: { message: "amount, currency, creditorName, creditorIBAN required" } });
    }

    // RFC 8259 JSON — Deutsche Bank SEPA Credit Transfer payload
    const paymentPayload = {
      instructedAmount: {
        currency: currency,
        amount:   String(amount),
      },
      creditorAccount: {
        iban: creditorIBAN.replace(/\s/g, ""),
        ...(creditorBIC ? { bic: creditorBIC } : {}),
      },
      creditorName: creditorName,
      ...(debtorIBAN ? { debtorAccount: { iban: debtorIBAN.replace(/\s/g, "") } } : {}),
      remittanceInformationUnstructured: reference || "PrimeStack payment",
    };

    try {
      const r = await dbPost("/v1/payments/sepa-credit-transfers", paymentPayload);

      if (r.ok) {
        // Record in platform ledger
        const ref = `DB-PAY-${Date.now()}`;
        await postLedgerEntry(
          ref,
          `PLATFORM:RESERVE:${currency}`,
          `DB:OUTGOING:${currency}`,
          amount, currency,
          `Deutsche Bank payment to ${creditorName}`,
          { creditorIBAN, creditorName, reference, dbPaymentId: r.data?.paymentId }
        );
        await postAudit("DB_PAYMENT_INITIATED",
          `DB payment: ${currency} ${amount} → ${creditorName}`,
          { amount, currency, creditorName, creditorIBAN, ref }
        );
      }

      return json(res, r.ok ? 201 : 502, { success: r.ok, data: r.data });
    } catch (e) {
      return json(res, 502, { success: false, error: e.message });
    }
  }

  // ── Receive incoming (DB notifies us) ─────────────────────────
  if (req.method === "POST" && path === "/db/webhook") {
    const rawBody = await readBody(req);
    let event;
    try { event = JSON.parse(rawBody.toString()); }
    catch { return json(res, 400, { error: "Invalid JSON" }); }

    // Acknowledge immediately
    json(res, 200, { received: true });

    // Process incoming credit notification
    const txType = event.transactionType || event.type || "";
    if (txType === "credit" || txType === "CREDIT" || event.creditedAmount) {
      const amount     = event.creditedAmount?.amount   || event.amount || "0";
      const currency   = event.creditedAmount?.currency || event.currency || "USD";
      const senderName = event.debtorName || event.sender?.name || "Deutsche Bank Transfer";
      const ref        = event.endToEndId || event.reference || `DB-IN-${Date.now()}`;

      const ledger = await postLedgerEntry(
        `DB-${ref}`,
        `DB:INCOMING:${currency}`,
        `PLATFORM:RESERVE:${currency}`,
        amount, currency,
        `Deutsche Bank incoming: ${currency} ${amount} from ${senderName}`,
        { source: "db_webhook", ref, senderName, event }
      );
      await postAudit("DB_INCOMING_CREDIT",
        `DB incoming: ${currency} ${amount} from ${senderName}`,
        { amount, currency, senderName, ref, entryId: ledger?.data?.entryId }
      );
      console.log(`[db] Incoming credit: ${currency} ${amount} from ${senderName} | Ref: ${ref}`);
    }
    return;
  }

  // ── Manual test (sandbox) ─────────────────────────────────────
  if (req.method === "POST" && path === "/db/test-incoming") {
    const rawBody = await readBody(req);
    let body;
    try { body = JSON.parse(rawBody.toString() || "{}"); }
    catch { body = {}; }

    const amount     = body.amount     || "10000.00";
    const currency   = body.currency   || "USD";
    const senderName = body.senderName || "Deutsche Bank Test";
    const ref        = body.reference  || `DB-TEST-${Date.now()}`;

    const ledger = await postLedgerEntry(
      `DB-${ref}`,
      `DB:INCOMING:${currency}`,
      `PLATFORM:RESERVE:${currency}`,
      amount, currency,
      `[TEST] DB incoming: ${currency} ${amount} from ${senderName}`,
      { source: "db_test", ref, senderName, testMode: true }
    );

    return json(res, 200, {
      success: true,
      testMode: true,
      amount, currency, senderName,
      destination: `PLATFORM:RESERVE:${currency}`,
      ledger,
    });
  }

  return json(res, 404, { error: "Not found", path });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║      PrimeStack — Deutsche Bank Integration           ║
╠═══════════════════════════════════════════════════════╣
║  Health:    http://localhost:${PORT}/health                ║
║  Token:     POST /db/token                            ║
║  Accounts:  GET  /db/accounts                         ║
║  Payments:  POST /db/payments                         ║
║  Webhook:   POST /db/webhook                          ║
║  Test:      POST /db/test-incoming                    ║
║                                                       ║
║  DB Env:    ${DB_ENV.padEnd(47)}║
║  Configured:${(!!(DB_CLIENT_ID && DB_CLIENT_SECRET)).toString().padEnd(47)}║
╚═══════════════════════════════════════════════════════╝
`);
  if (!DB_CLIENT_ID) {
    console.warn("⚠  DB_CLIENT_ID not set — add to .env");
  }
  if (!DB_CERT_PATH) {
    console.warn("⚠  DB_CERT_PATH not set — mTLS disabled");
  }
});
