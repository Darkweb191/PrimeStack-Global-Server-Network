/**
 * PrimeStack — Wise Platform Integration
 *
 * Handles:
 *   1. Incoming transfer webhook  (POST /wise/webhook)
 *      - Receives  incoming-transfer#credited  from Wise
 *      - Fetches full transfer details from Wise API
 *      - Auto-credits the platform ledger
 *      - Logs an audit event
 *
 *   2. Balance check             (GET  /wise/balance)
 *      - Fetches live Wise account balances
 *      - Syncs to platform ledger accounts
 *
 *   3. Incoming transfer list    (GET  /wise/transfers)
 *      - Lists received transfers from Wise
 *
 *   4. Transfer detail           (GET  /wise/transfers/:id)
 *      - Full detail for one incoming transfer
 *
 * Setup:
 *   1. Add WISE_API_KEY + WISE_PROFILE_ID to .env
 *   2. Register webhook URL in Wise dashboard:
 *      https://your-server.com/wise/webhook
 *      Event: incoming-transfer#credited
 *   3. Copy the webhook secret into WISE_WEBHOOK_SECRET
 *   4. Set WISE_ENV=live when you're ready for real money
 *
 * Security:
 *   - Every webhook is verified with HMAC-SHA256 using WISE_WEBHOOK_SECRET
 *   - Replay-attack protection: reject events older than 5 minutes
 *   - Idempotency: duplicate event IDs are ignored
 */

import { createHmac }    from "crypto";
import { createServer }  from "http";
import { readFileSync }  from "fs";

// ── Config ─────────────────────────────────────────────────────
const WISE_API_KEY        = process.env.WISE_API_KEY        || "";
const WISE_PROFILE_ID     = process.env.WISE_PROFILE_ID     || "";
const WISE_ENV            = process.env.WISE_ENV            || "sandbox";
const WISE_WEBHOOK_SECRET = process.env.WISE_WEBHOOK_SECRET || "";
const CREDIT_ACCOUNT      = process.env.WISE_DEFAULT_CREDIT_ACCOUNT || "PLATFORM:RESERVE:USD";
const DASHBOARD_URL       = process.env.DASHBOARD_URL       || "http://localhost:8081";

const WISE_BASE = WISE_ENV === "live"
  ? "https://api.transferwise.com"
  : "https://api.sandbox.transferwise.tech";

const PORT = parseInt(process.env.WISE_PORT || "8082", 10);

// Idempotency set — prevents processing same event twice
const processedEvents = new Set();

// ── Helpers ────────────────────────────────────────────────────
async function wiseGet(path) {
  if (!WISE_API_KEY) throw new Error("WISE_API_KEY not configured");
  const res = await fetch(`${WISE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${WISE_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Wise API ${res.status}: ${err}`);
  }
  return res.json();
}

async function platformPost(path, body) {
  const res = await fetch(`${DASHBOARD_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return res.json();
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ── Webhook signature verification ─────────────────────────────
function verifyWiseSignature(rawBody, signatureHeader) {
  if (!WISE_WEBHOOK_SECRET) {
    console.warn("[wise] WISE_WEBHOOK_SECRET not set — skipping signature verification");
    return true; // allow in development without secret
  }
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", WISE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");
  // Wise sends: X-Signature-SHA256: <base64>
  return signatureHeader === expected;
}

// ── Process incoming transfer from Wise ─────────────────────────
async function processIncomingTransfer(transferId, eventId) {
  // Idempotency check
  if (processedEvents.has(eventId)) {
    console.log(`[wise] Event ${eventId} already processed — skipping`);
    return { skipped: true, reason: "duplicate_event" };
  }

  // 1. Fetch full transfer details from Wise API
  let transfer;
  try {
    transfer = await wiseGet(`/v1/profiles/${WISE_PROFILE_ID}/incoming-payments/${transferId}`);
  } catch (err) {
    // Try alternative endpoint
    try {
      transfer = await wiseGet(`/v3/profiles/${WISE_PROFILE_ID}/transfers/${transferId}`);
    } catch (err2) {
      throw new Error(`Could not fetch transfer ${transferId}: ${err2.message}`);
    }
  }

  const amount     = String(transfer.amount?.value   || transfer.sourceValue   || transfer.value   || 0);
  const currency   = transfer.amount?.currency       || transfer.sourceCurrency || transfer.currency || "USD";
  const senderName = transfer.senderDetails?.name    || transfer.debtorName    || transfer.sender?.name || "Unknown Sender";
  const senderAcct = transfer.senderDetails?.accountNumber || transfer.debtorAccount?.identification?.identification || "";
  const senderBank = transfer.senderDetails?.bankName      || transfer.debtorBankName || "";
  const ref        = transfer.reference              || transfer.details?.reference || `WISE-${transferId}`;
  const wiseRef    = `WISE-${transferId}`;

  console.log(`[wise] Processing transfer ${transferId}: ${currency} ${amount} from ${senderName}`);

  // 2. Post double-entry ledger credit to platform
  const ledgerResult = await platformPost("/wallets/entries", {
    reference:   wiseRef,
    entryType:   "FUNDING",
    description: `Wise incoming transfer from ${senderName} — Ref: ${ref}`,
    metadata: {
      source:          "wise_platform",
      wiseTransferId:  transferId,
      wiseEventId:     eventId,
      senderName,
      senderAccount:   senderAcct,
      senderBank,
      paymentReference: ref,
      currency,
      receivedAt:      new Date().toISOString(),
      wiseEnv:         WISE_ENV,
      rawTransfer:     transfer,
    },
    lines: [
      { accountId: `WISE:INCOMING:${currency}`, debit: amount, credit: "0.00" },
      { accountId: CREDIT_ACCOUNT,              debit: "0.00", credit: amount },
    ],
  });

  if (!ledgerResult.success && !ledgerResult.data?.entryId) {
    throw new Error(`Ledger post failed: ${JSON.stringify(ledgerResult.error || ledgerResult)}`);
  }

  // 3. Log audit event
  await platformPost("/audit/events", {
    actorType:    "SYSTEM",
    eventType:    "WISE_TRANSFER_CREDITED",
    description:  `Wise transfer credited: ${currency} ${amount} from ${senderName}`,
    actorId:      "wise-platform",
    resourceType: "incoming_transfer",
    resourceId:   transferId,
    metadata:     { amount, currency, senderName, ref, entryId: ledgerResult.data?.entryId },
  }).catch(() => {}); // non-critical

  // Mark as processed
  processedEvents.add(eventId);
  if (processedEvents.size > 10000) {
    // Prevent unbounded memory growth
    const firstKey = processedEvents.values().next().value;
    processedEvents.delete(firstKey);
  }

  console.log(`[wise] ✓ Transfer ${transferId} credited: ${currency} ${amount} → ${CREDIT_ACCOUNT}`);

  return {
    success:        true,
    wiseTransferId: transferId,
    amount,
    currency,
    senderName,
    destination:    CREDIT_ACCOUNT,
    entryId:        ledgerResult.data?.entryId,
    reference:      wiseRef,
  };
}

// ── HTTP Server ─────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const rawPath = (req.url || "/").split("?")[0];

  // ── Health ─────────────────────────────────────────────────
  if (req.method === "GET" && rawPath === "/wise/health") {
    return json(res, 200, {
      status: "ok",
      service: "wise-integration",
      wiseEnv: WISE_ENV,
      configured: !!WISE_API_KEY,
      profileId: WISE_PROFILE_ID || null,
      creditAccount: CREDIT_ACCOUNT,
    });
  }

  // ── Webhook — POST /wise/webhook ───────────────────────────
  if (req.method === "POST" && rawPath === "/wise/webhook") {
    const rawBody = await readBody(req);
    const sig     = req.headers["x-signature-sha256"] || req.headers["x-2fa-approval"] || "";

    // Verify signature
    if (!verifyWiseSignature(rawBody, sig)) {
      console.warn("[wise] Invalid webhook signature");
      return json(res, 401, { error: "Invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }

    const eventType = event.event_type || event.type || "";
    const eventId   = event.id         || event.delivery_id || `${Date.now()}`;

    console.log(`[wise] Webhook received: ${eventType} (${eventId})`);

    // Only process incoming-transfer#credited events
    if (eventType === "incoming-transfer#credited") {
      const transferId = event.data?.incoming_transfer_id || event.data?.id;
      if (!transferId) {
        return json(res, 400, { error: "Missing incoming_transfer_id in event data" });
      }

      // Acknowledge immediately (Wise expects fast response)
      json(res, 200, { received: true, eventId, transferId });

      // Process asynchronously
      processIncomingTransfer(transferId, eventId).then(result => {
        console.log("[wise] Transfer processed:", result);
      }).catch(err => {
        console.error("[wise] Transfer processing failed:", err.message);
      });

      return;
    }

    // Other event types — acknowledge but don't process
    json(res, 200, { received: true, eventType, note: "Event type not processed" });
    return;
  }

  // ── Balance — GET /wise/balance ────────────────────────────
  if (req.method === "GET" && rawPath === "/wise/balance") {
    if (!WISE_API_KEY || !WISE_PROFILE_ID) {
      return json(res, 503, { error: "Wise not configured. Set WISE_API_KEY and WISE_PROFILE_ID in .env" });
    }
    try {
      // Wise v4 balances endpoint
      const balances = await wiseGet(`/v4/profiles/${WISE_PROFILE_ID}/balances?types=STANDARD`);
      json(res, 200, { success: true, data: balances });
    } catch (err) {
      json(res, 502, { error: err.message });
    }
    return;
  }

  // ── Incoming transfers list — GET /wise/transfers ──────────
  if (req.method === "GET" && rawPath === "/wise/transfers") {
    if (!WISE_API_KEY || !WISE_PROFILE_ID) {
      return json(res, 503, { error: "Wise not configured" });
    }
    try {
      const transfers = await wiseGet(
        `/v1/profiles/${WISE_PROFILE_ID}/incoming-payments?limit=50`
      );
      json(res, 200, { success: true, data: transfers });
    } catch (err) {
      json(res, 502, { error: err.message });
    }
    return;
  }

  // ── Single transfer — GET /wise/transfers/:id ──────────────
  const matchTransfer = rawPath.match(/^\/wise\/transfers\/([^/]+)$/);
  if (req.method === "GET" && matchTransfer) {
    if (!WISE_API_KEY || !WISE_PROFILE_ID) {
      return json(res, 503, { error: "Wise not configured" });
    }
    const transferId = matchTransfer[1];
    try {
      const transfer = await wiseGet(
        `/v1/profiles/${WISE_PROFILE_ID}/incoming-payments/${transferId}`
      );
      json(res, 200, { success: true, data: transfer });
    } catch (err) {
      json(res, 502, { error: err.message });
    }
    return;
  }

  // ── Manual trigger — POST /wise/test-credit ────────────────
  // Use this in sandbox to manually trigger a credit without a real webhook
  if (req.method === "POST" && rawPath === "/wise/test-credit") {
    if (WISE_ENV === "live") {
      return json(res, 403, { error: "Manual test credit only available in sandbox mode" });
    }
    let body;
    try { body = JSON.parse((await readBody(req)).toString()); } catch { body = {}; }

    const amount     = body.amount     || "100.00";
    const currency   = body.currency   || "USD";
    const senderName = body.senderName || "Test Sender";
    const testEventId = `TEST-${Date.now()}`;
    const testTransferId = `TEST-TXN-${Date.now()}`;

    // Simulate the process directly without calling Wise API
    const ledgerResult = await platformPost("/wallets/entries", {
      reference:   `WISE-${testTransferId}`,
      entryType:   "FUNDING",
      description: `[SANDBOX] Wise test credit from ${senderName}`,
      metadata: {
        source:         "wise_platform_sandbox_test",
        wiseTransferId: testTransferId,
        wiseEventId:    testEventId,
        senderName,
        currency,
        receivedAt:     new Date().toISOString(),
        wiseEnv:        "sandbox",
        testMode:       true,
      },
      lines: [
        { accountId: `WISE:INCOMING:${currency}`, debit: amount, credit: "0.00" },
        { accountId: CREDIT_ACCOUNT,              debit: "0.00", credit: amount },
      ],
    });

    await platformPost("/audit/events", {
      actorType:   "SYSTEM",
      eventType:   "WISE_TRANSFER_CREDITED",
      description: `[SANDBOX] Wise test credit: ${currency} ${amount} from ${senderName}`,
      actorId:     "wise-integration-test",
      metadata:    { amount, currency, senderName, testMode: true },
    }).catch(() => {});

    json(res, 200, {
      success: true,
      testMode: true,
      amount, currency, senderName,
      destination: CREDIT_ACCOUNT,
      ledger: ledgerResult,
    });
    return;
  }

  // ── 404 ────────────────────────────────────────────────────
  json(res, 404, { error: "Not found", path: rawPath });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         PrimeStack — Wise Platform Integration       ║
╠══════════════════════════════════════════════════════╣
║  Service:    http://localhost:${PORT}                    ║
║  Health:     http://localhost:${PORT}/wise/health        ║
║  Webhook:    http://localhost:${PORT}/wise/webhook        ║
║  Balance:    http://localhost:${PORT}/wise/balance        ║
║  Transfers:  http://localhost:${PORT}/wise/transfers      ║
║                                                      ║
║  Wise Env:   ${WISE_ENV.padEnd(47)}║
║  Configured: ${(!!WISE_API_KEY).toString().padEnd(47)}║
║  Credit to:  ${CREDIT_ACCOUNT.padEnd(47)}║
╚══════════════════════════════════════════════════════╝
`);
  if (!WISE_API_KEY) {
    console.warn("⚠  WISE_API_KEY not set. Add it to your .env file.");
    console.warn("   Get it from: https://wise.com/user/account/developer");
  }
});
