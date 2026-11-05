/**
 * PrimeStack Payment Rails Service
 *
 * ARCHITECTURE: Pass-through only. Zero customer fund holding.
 *
 *   Customer registers bank account
 *        ↓
 *   Someone sends money to that customer's Wise virtual IBAN
 *        ↓
 *   Wise fires  incoming-transfer#credited  webhook → this service
 *        ↓
 *   This service looks up which customer owns that account number
 *        ↓
 *   Immediately creates a Wise payout to customer's real bank
 *        ↓
 *   Audit record + ledger entry (in-transit only, no balance held)
 *        ↓
 *   Customer receives money in their own bank account
 *
 * We are the RAILS. We route. We never hold.
 *
 * Endpoints:
 *   GET  /health
 *   POST /rails/customers             — register a customer + bank account
 *   GET  /rails/customers             — list all customers
 *   GET  /rails/customers/:id         — get one customer
 *   PUT  /rails/customers/:id/bank    — update customer bank details
 *   DEL  /rails/customers/:id         — remove customer
 *   GET  /rails/customers/:id/transactions — customer transaction history
 *   POST /rails/webhook               — Wise incoming-transfer#credited
 *   GET  /rails/transactions          — all rails transactions
 *   GET  /rails/stats                 — platform stats
 *   POST /rails/manual-payout         — manual payout trigger (admin)
 */

import { createHmac, timingSafeEqual } from "crypto";
import { createServer } from "http";
import { PrismaClient } from "@prisma/client";

// ── Config ─────────────────────────────────────────────────────
const WISE_API_KEY        = process.env.WISE_API_KEY        || "";
const WISE_PROFILE_ID     = process.env.WISE_PROFILE_ID     || "";
const WISE_ENV            = process.env.WISE_ENV            || "sandbox";
const WISE_WEBHOOK_SECRET = process.env.WISE_WEBHOOK_SECRET || "";
const PORT                = parseInt(process.env.RAILS_PORT || process.env.WISE_PORT || "8082", 10);
const PAYOUT_DELAY_MS     = parseInt(process.env.RAILS_PAYOUT_DELAY_MS || "0", 10);

// The ledger and the audit trail both live inside the Fastify API, which is
// closed by default: every call is HMAC-signed with the internal service key.
const API_BASE    = (process.env.API_BASE_URL || process.env.PRIMESTACK_API_URL || "http://127.0.0.1:8081").replace(/\/+$/, "");
const HMAC_KEY_ID = process.env.LEDGER_HMAC_KEY_ID || process.env.CONSOLE_HMAC_KEY_ID || "psk_console_001";
const HMAC_SECRET = process.env.LEDGER_HMAC_SECRET || process.env.CONSOLE_HMAC_SECRET || "";
const HMAC_PREFIX = process.env.HMAC_HEADER_PREFIX || "x-primestack";

const prisma = new PrismaClient();

const WISE_BASE = WISE_ENV === "live"
  ? "https://api.transferwise.com"
  : "https://api.sandbox.transferwise.tech";

// ── Persistence ────────────────────────────────────────────────
// Customers, transactions and webhook idempotency all live in PostgreSQL
// (RailsCustomer / RailsTransaction), so registrations survive restarts and
// deploys. `bankDetails` is stored as JSON:
//   { type, accountHolder, currency,
//     routingNumber?, accountNumber?, iban?, swiftCode?,
//     phone?, provider? }

// ── HTTP helpers ───────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
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

async function parseBody(req) {
  const raw = await readBody(req);
  try { return { raw, parsed: JSON.parse(raw.toString()) }; }
  catch { return { raw, parsed: {} }; }
}

// ── Wise API helpers ───────────────────────────────────────────
async function wiseGet(path) {
  if (!WISE_API_KEY) throw new Error("WISE_API_KEY not configured");
  const r = await fetch(`${WISE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${WISE_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Wise ${r.status}: ${await r.text()}`);
  return r.json();
}

async function wisePost(path, body) {
  if (!WISE_API_KEY) throw new Error("WISE_API_KEY not configured");
  const r = await fetch(`${WISE_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WISE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`Wise ${r.status}: ${text.substring(0, 300)}`);
  return data;
}

// ── Platform ledger + audit helpers ────────────────────────────

/** Signature contract: HMAC-SHA256(secret, keyId + timestamp + body), ms epoch. */
function signedHeaders(body) {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", HMAC_SECRET)
    .update(`${HMAC_KEY_ID}${timestamp}${body}`)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    [`${HMAC_PREFIX}-key-id`]: HMAC_KEY_ID,
    [`${HMAC_PREFIX}-timestamp`]: timestamp,
    [`${HMAC_PREFIX}-signature`]: signature,
  };
}

async function postLedgerEntry(ref, debitAccount, creditAccount, amount, currency, description, metadata) {
  const body = JSON.stringify({
    reference: ref,
    entryType: "TRANSFER",
    description,
    source: "rails_service",
    postedBy: "rails-service",
    metadata: { ...metadata, currency },
    lines: [
      { accountCode: debitAccount,  debit: String(amount), credit: "0" },
      { accountCode: creditAccount, debit: "0",            credit: String(amount) },
    ],
  });

  try {
    const r = await fetch(`${API_BASE}/ledger/entries`, {
      method: "POST",
      headers: signedHeaders(body),
      body,
      signal: AbortSignal.timeout(10000),
    });
    const result = await r.json();
    if (!r.ok || result?.success === false) {
      console.error(`[rails] Ledger post rejected (HTTP ${r.status}):`, result?.error?.message || "");
    }
    return result;
  } catch (e) {
    console.error("[rails] Ledger post failed:", e.message);
    return { success: false, error: e.message };
  }
}

/** Audit events are written straight to the audit trail table. */
async function postAudit(eventType, description, actorId, metadata) {
  try {
    await prisma.auditLog.create({
      data: {
        action: eventType,
        entity: "RAILS",
        after: { description, actorId: actorId || null, ...(metadata || {}) },
        userAgent: "rails-service",
      },
    });
  } catch (e) {
    console.error("[rails] Audit write failed:", e.message);
  }
}

// ── Webhook signature verification (fail-closed) ───────────────
function verifySignature(rawBody, sigHeader) {
  if (!WISE_WEBHOOK_SECRET) return false; // no secret configured — never accept
  if (!sigHeader) return false;
  const expected = createHmac("sha256", WISE_WEBHOOK_SECRET)
    .update(rawBody).digest("base64");
  const provided = Buffer.from(String(sigHeader));
  const computed = Buffer.from(expected);
  return provided.length === computed.length && timingSafeEqual(provided, computed);
}

// ── Find customer by incoming account identifier ───────────────
async function findCustomerByAccount(transferData) {
  // Match by Wise virtual IBAN / account number that received the money
  const incomingIBAN    = transferData?.creditedAccountDetails?.iban
                       || transferData?.targetAccount?.iban
                       || transferData?.beneficiaryAccountNumber;
  const incomingAccount = transferData?.creditedAccountDetails?.accountNumber
                       || transferData?.targetAccount?.accountNumber;

  if (incomingIBAN) {
    const match = await prisma.railsCustomer.findFirst({ where: { wiseIBAN: incomingIBAN } });
    if (match) return match;
  }
  if (incomingAccount) {
    const match = await prisma.railsCustomer.findFirst({ where: { wiseAccountNumber: incomingAccount } });
    if (match) return match;
  }

  // Fall back to the customer email / id appearing in the Wise reference
  const ref = (transferData?.reference || "").toLowerCase();
  if (ref) {
    const all = await prisma.railsCustomer.findMany();
    return all.find(c =>
      ref.includes(c.email.toLowerCase()) || ref.includes(c.id.toLowerCase())
    ) || null;
  }
  return null;
}

// ── CORE: Process incoming transfer → payout to customer ────────
async function processAndPayout(transferId, eventId, rawTransferData) {
  // Idempotency: eventId is UNIQUE — a webhook replay can never double-pay.
  const already = await prisma.railsTransaction.findUnique({ where: { eventId } });
  if (already) {
    console.log(`[rails] Event ${eventId} already processed — skip`);
    return { skipped: true, id: already.id, status: already.status };
  }

  const txId = `RAILS-${Date.now()}-${String(transferId).slice(-6)}`;
  await prisma.railsTransaction.create({
    data: { id: txId, eventId, transferId, status: "PROCESSING" },
  });

  try {
    // 1. Fetch full transfer details from Wise
    let transfer = rawTransferData;
    if (!transfer || !transfer.amount) {
      try {
        transfer = await wiseGet(
          `/v1/profiles/${WISE_PROFILE_ID}/incoming-payments/${transferId}`
        );
      } catch {
        transfer = await wiseGet(
          `/v3/profiles/${WISE_PROFILE_ID}/transfers/${transferId}`
        );
      }
    }

    const inAmount   = String(transfer.amount?.value   || transfer.sourceValue   || transfer.value   || 0);
    const inCurrency = transfer.amount?.currency        || transfer.sourceCurrency || transfer.currency || "USD";
    const senderName = transfer.senderDetails?.name     || transfer.debtorName    || "Unknown Sender";
    const senderAcct = transfer.senderDetails?.accountNumber || transfer.debtorAccount?.identification?.identification || "";
    const reference  = transfer.reference || transfer.details?.reference || `IN-${transferId}`;

    await prisma.railsTransaction.update({
      where: { id: txId },
      data: { inAmount, inCurrency, senderName, senderAccount: senderAcct, metadata: { reference } },
    });

    console.log(`[rails] Incoming: ${inCurrency} ${inAmount} from ${senderName} | Transfer: ${transferId}`);

    // 2. Find which customer this transfer belongs to
    const customer = await findCustomerByAccount(transfer);

    if (!customer) {
      // No customer matched — credit platform reserve and log for manual review
      console.warn(`[rails] No customer matched for transfer ${transferId} — routing to platform reserve`);
      await postLedgerEntry(
        `RAILS-UNMATCHED-${transferId}`,
        `WISE:INCOMING:${inCurrency}`,
        `RAILS:UNMATCHED:${inCurrency}`,
        inAmount, inCurrency,
        `Unmatched rails transfer from ${senderName}`,
        { transferId, senderName, reference, needsManualReview: true }
      );
      await prisma.railsTransaction.update({
        where: { id: txId },
        data: { status: "UNMATCHED", error: "No customer matched — manual review required" },
      });
      await postAudit("RAILS_UNMATCHED_TRANSFER",
        `Unmatched transfer: ${inCurrency} ${inAmount} from ${senderName}`,
        "rails-service", { transferId, inAmount, inCurrency, senderName }
      );
      return { id: txId, status: "UNMATCHED" };
    }

    await prisma.railsTransaction.update({ where: { id: txId }, data: { customerId: customer.id } });
    console.log(`[rails] Matched customer: ${customer.name} (${customer.id})`);

    // 3. Ledger: in-transit entry (WISE:INCOMING → RAILS:IN_TRANSIT)
    // We credit in-transit, not the customer's wallet — we're pass-through
    const transitRef = `TRANSIT-${txId}`;
    await postLedgerEntry(
      transitRef,
      `WISE:INCOMING:${inCurrency}`,
      `RAILS:IN_TRANSIT:${inCurrency}`,
      inAmount, inCurrency,
      `Rails in-transit: ${inAmount} ${inCurrency} for customer ${customer.name}`,
      { transferId, customerId: customer.id, senderName }
    );

    // 4. Apply payout delay if configured (default 0 = instant)
    if (PAYOUT_DELAY_MS > 0) await new Promise(r => setTimeout(r, PAYOUT_DELAY_MS));

    // 5. Create payout to customer's bank via Wise
    const payoutRef = `PAYOUT-${txId}`;
    await prisma.railsTransaction.update({ where: { id: txId }, data: { payoutRef } });

    const bank = customer.bankDetails || {};
    let payoutResult;
    if (WISE_API_KEY && WISE_PROFILE_ID) {
      payoutResult = await createWisePayout(customer, inAmount, inCurrency, payoutRef, reference);
    } else {
      // Development mode — simulate payout
      payoutResult = {
        simulated:  true,
        id:         `SIM-${Date.now()}`,
        status:     "processing",
        amount:     inAmount,
        currency:   inCurrency,
        recipient:  customer.name,
        bank:       bank.bankName || bank.provider || "Simulated Bank",
      };
      console.log(`[rails] [DEV] Simulated payout: ${inCurrency} ${inAmount} → ${customer.name}`);
    }

    const payoutStatus = payoutResult.status || "processing";

    // 6. Ledger: clear in-transit (payout dispatched)
    await postLedgerEntry(
      `CLEAR-${txId}`,
      `RAILS:IN_TRANSIT:${inCurrency}`,
      `RAILS:PAYOUT_DISPATCHED:${inCurrency}`,
      inAmount, inCurrency,
      `Rails payout dispatched to ${customer.name}`,
      { payoutRef, customerId: customer.id, payoutId: payoutResult.id }
    );

    // 7. Update customer stats + settle the transaction row
    await prisma.$transaction([
      prisma.railsCustomer.update({
        where: { id: customer.id },
        data: {
          totalReceived:     { increment: inAmount },
          transactionCount:  { increment: 1 },
          lastTransactionAt: new Date(),
        },
      }),
      prisma.railsTransaction.update({
        where: { id: txId },
        data: { status: "COMPLETED", payoutStatus, payoutRef },
      }),
    ]);

    // 8. Audit log
    await postAudit(
      "RAILS_PAYOUT_DISPATCHED",
      `Rails payout: ${inCurrency} ${inAmount} → ${customer.name} (${bank.type})`,
      "rails-service",
      { transferId, customerId: customer.id, inAmount, inCurrency, payoutRef, payoutId: payoutResult.id }
    );

    console.log(`[rails] ✓ Payout dispatched: ${inCurrency} ${inAmount} → ${customer.name} | Ref: ${payoutRef}`);
    return { id: txId, status: "COMPLETED", payoutRef, payoutStatus };

  } catch (err) {
    await prisma.railsTransaction
      .update({ where: { id: txId }, data: { status: "FAILED", error: err.message } })
      .catch(() => {});
    console.error(`[rails] ✗ Processing failed for ${transferId}:`, err.message);
    await postAudit("RAILS_PAYOUT_FAILED",
      `Rails payout failed: ${err.message}`,
      "rails-service",
      { transferId, error: err.message }
    );
    return { id: txId, status: "FAILED", error: err.message };
  }
}

// ── Create Wise payout to customer's bank ──────────────────────
async function createWisePayout(customer, amount, currency, reference, originalRef) {
  const bank = customer.bankDetails;

  // Step 1: Create or get recipient account in Wise
  let recipientAccount;

  if (bank.type === "BANK_ACCOUNT") {
    // International wire / SWIFT
    recipientAccount = await wisePost(`/v1/accounts`, {
      profile:  WISE_PROFILE_ID,
      currency: bank.currency || currency,
      type:     bank.iban ? "iban" : "swift_code",
      accountHolderName: bank.accountHolder,
      details: bank.iban
        ? { legalType: "PRIVATE", iban: bank.iban.replace(/\s/g, "") }
        : {
            legalType:        "PRIVATE",
            swiftCode:        bank.swiftCode,
            accountNumber:    bank.accountNumber,
            address:          { country: bank.country || "US", city: "—", firstLine: "—" },
          },
    });
  } else if (bank.type === "ACH") {
    // US ACH
    recipientAccount = await wisePost(`/v1/accounts`, {
      profile:  WISE_PROFILE_ID,
      currency: "USD",
      type:     "aba",
      accountHolderName: bank.accountHolder,
      details: {
        legalType:     "PRIVATE",
        abartn:        bank.routingNumber,
        accountNumber: bank.accountNumber,
        accountType:   bank.accountType || "CHECKING",
        address:       { country: "US", city: "—", firstLine: "—" },
      },
    });
  } else if (bank.type === "FASTER_PAYMENTS") {
    // UK Faster Payments
    recipientAccount = await wisePost(`/v1/accounts`, {
      profile:  WISE_PROFILE_ID,
      currency: "GBP",
      type:     "sort_code",
      accountHolderName: bank.accountHolder,
      details: {
        legalType:     "PRIVATE",
        sortCode:      bank.sortCode,
        accountNumber: bank.accountNumber,
      },
    });
  } else if (bank.type === "SEPA") {
    // SEPA
    recipientAccount = await wisePost(`/v1/accounts`, {
      profile:  WISE_PROFILE_ID,
      currency: "EUR",
      type:     "iban",
      accountHolderName: bank.accountHolder,
      details: { legalType: "PRIVATE", iban: bank.iban.replace(/\s/g, "") },
    });
  } else if (bank.type === "MOBILE_MONEY") {
    // Mobile money (M-Pesa etc) — requires Wise mobile money product
    recipientAccount = await wisePost(`/v1/accounts`, {
      profile:  WISE_PROFILE_ID,
      currency: bank.currency || currency,
      type:     "mobilewallet",
      accountHolderName: bank.accountHolder,
      details: {
        legalType:   "PRIVATE",
        phoneNumber: bank.phone,
        provider:    bank.provider,
      },
    });
  } else {
    throw new Error(`Unsupported bank type: ${bank.type}`);
  }

  const recipientId = recipientAccount.id;

  // Step 2: Get quote for the transfer
  const quote = await wisePost(`/v3/profiles/${WISE_PROFILE_ID}/quotes`, {
    sourceCurrency: currency,
    targetCurrency: bank.currency || currency,
    sourceAmount:   parseFloat(amount),
    payOut:         "BANK_TRANSFER",
    preferredPayIn: "BALANCE",
  });

  // Step 3: Create the transfer
  const transfer = await wisePost(`/v1/transfers`, {
    targetAccount:      recipientId,
    quoteUuid:          quote.id,
    customerTransactionId: reference,
    details: {
      reference:  `${reference} — ${originalRef || "PrimeStack Rails"}`,
      transferPurpose: "verification.transfers.purpose.pay.bills",
    },
  });

  // Step 4: Fund the transfer from Wise balance
  await wisePost(`/v3/profiles/${WISE_PROFILE_ID}/transfers/${transfer.id}/payments`, {
    type: "BALANCE",
  });

  return {
    id:       transfer.id,
    status:   transfer.status,
    amount:   amount,
    currency: currency,
    quoteId:  quote.id,
    recipientId,
  };
}

// ── HTTP Server ─────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(); return;
  }

  const [rawPath, qs] = (req.url || "/").split("?");

  // ── Health ──────────────────────────────────────────────────
  if (rawPath === "/health") {
    const [customerCount, transactionCount] = await Promise.all([
      prisma.railsCustomer.count(),
      prisma.railsTransaction.count(),
    ]);
    return json(res, 200, {
      status:        "ok",
      service:       "rails-service",
      wiseEnv:       WISE_ENV,
      configured:    !!WISE_API_KEY,
      profileId:     WISE_PROFILE_ID || null,
      customers:     customerCount,
      transactions:  transactionCount,
    });
  }

  // ── Stats ───────────────────────────────────────────────────
  if (req.method === "GET" && rawPath === "/rails/stats") {
    const [customerCount, transactionCount, completed, failed, unmatched, volume] = await Promise.all([
      prisma.railsCustomer.count(),
      prisma.railsTransaction.count(),
      prisma.railsTransaction.count({ where: { status: "COMPLETED" } }),
      prisma.railsTransaction.count({ where: { status: "FAILED" } }),
      prisma.railsTransaction.count({ where: { status: "UNMATCHED" } }),
      prisma.railsTransaction.aggregate({
        _sum:  { inAmount: true },
        where: { status: "COMPLETED" },
      }),
    ]);
    return json(res, 200, {
      success: true,
      data: {
        customers:    customerCount,
        transactions: transactionCount,
        completed,
        failed,
        unmatched,
        totalVolume:  Number(volume._sum.inAmount || 0).toFixed(2),
        configured:   !!WISE_API_KEY,
        wiseEnv:      WISE_ENV,
      },
    });
  }

  // ── Register customer ───────────────────────────────────────
  if (req.method === "POST" && rawPath === "/rails/customers") {
    const { parsed } = await parseBody(req);
    const { name, email, phone, wiseAccountNumber, wiseIBAN, bankDetails } = parsed;

    if (!name || !email) {
      return json(res, 422, { success: false, error: { message: "name and email are required" } });
    }
    if (!bankDetails || !bankDetails.type) {
      return json(res, 422, { success: false, error: { message: "bankDetails.type is required" } });
    }
    if (!bankDetails.accountHolder) {
      return json(res, 422, { success: false, error: { message: "bankDetails.accountHolder is required" } });
    }

    // Validate required fields per bank type
    const bt = bankDetails.type;
    if ((bt === "ACH") && (!bankDetails.routingNumber || !bankDetails.accountNumber)) {
      return json(res, 422, { success: false, error: { message: "ACH requires routingNumber and accountNumber" } });
    }
    if ((bt === "SEPA" || bt === "BANK_ACCOUNT") && !bankDetails.iban && !bankDetails.swiftCode) {
      return json(res, 422, { success: false, error: { message: "SEPA/BANK_ACCOUNT requires iban or swiftCode" } });
    }
    if (bt === "FASTER_PAYMENTS" && (!bankDetails.sortCode || !bankDetails.accountNumber)) {
      return json(res, 422, { success: false, error: { message: "Faster Payments requires sortCode and accountNumber" } });
    }
    if (bt === "MOBILE_MONEY" && (!bankDetails.phone || !bankDetails.provider)) {
      return json(res, 422, { success: false, error: { message: "Mobile money requires phone and provider" } });
    }

    // Allocate the next sequential customer id (retry on the rare collision a
    // deletion could leave behind).
    let id = null;
    const base = await prisma.railsCustomer.count();
    for (let n = base + 1; n <= base + 25 && !id; n++) {
      const candidate = `CUST-${String(n).padStart(6, "0")}`;
      if (!(await prisma.railsCustomer.findUnique({ where: { id: candidate } }))) id = candidate;
    }
    if (!id) {
      return json(res, 500, { success: false, error: { message: "Could not allocate a customer id" } });
    }

    const customer = await prisma.railsCustomer.create({
      data: {
        id,
        name,
        email,
        phone:             phone || null,
        wiseAccountNumber: wiseAccountNumber || null,
        wiseIBAN:          wiseIBAN || null,
        bankDetails,
      },
    });

    await postAudit("RAILS_CUSTOMER_REGISTERED",
      `Customer registered: ${name} (${id}) — ${bankDetails.type}`,
      "rails-admin", { id, name, email, bankType: bankDetails.type }
    );

    console.log(`[rails] Customer registered: ${name} (${id}) | ${bankDetails.type}`);
    return json(res, 201, { success: true, data: customer });
  }

  // ── List customers ──────────────────────────────────────────
  if (req.method === "GET" && rawPath === "/rails/customers") {
    const list = await prisma.railsCustomer.findMany({ orderBy: { createdAt: "desc" } });
    return json(res, 200, { success: true, data: list, meta: { total: list.length } });
  }

  // ── Get one customer ────────────────────────────────────────
  const custMatch = rawPath.match(/^\/rails\/customers\/([^/]+)$/);
  if (req.method === "GET" && custMatch) {
    const c = await prisma.railsCustomer.findUnique({ where: { id: custMatch[1] } });
    if (!c) return json(res, 404, { success: false, error: { message: "Customer not found" } });
    return json(res, 200, { success: true, data: c });
  }

  // ── Update customer bank details ────────────────────────────
  const bankMatch = rawPath.match(/^\/rails\/customers\/([^/]+)\/bank$/);
  if (req.method === "PUT" && bankMatch) {
    const c = await prisma.railsCustomer.findUnique({ where: { id: bankMatch[1] } });
    if (!c) return json(res, 404, { success: false, error: { message: "Customer not found" } });
    const { parsed } = await parseBody(req);
    const updated = await prisma.railsCustomer.update({
      where: { id: bankMatch[1] },
      data:  { bankDetails: { ...(c.bankDetails || {}), ...parsed } },
    });
    return json(res, 200, { success: true, data: updated });
  }

  // ── Delete customer ─────────────────────────────────────────
  const delMatch = rawPath.match(/^\/rails\/customers\/([^/]+)$/);
  if (req.method === "DELETE" && delMatch) {
    // RailsTransaction.customerId is an optional relation — deleting the
    // customer nulls the link but keeps the immutable rails history.
    const existed = await prisma.railsCustomer
      .delete({ where: { id: delMatch[1] } })
      .catch(() => null);
    return json(res, 200, { success: true, data: { removed: !!existed } });
  }

  // ── Customer transactions ───────────────────────────────────
  const custTxMatch = rawPath.match(/^\/rails\/customers\/([^/]+)\/transactions$/);
  if (req.method === "GET" && custTxMatch) {
    const custTx = await prisma.railsTransaction.findMany({
      where:   { customerId: custTxMatch[1] },
      orderBy: { receivedAt: "desc" },
    });
    return json(res, 200, { success: true, data: custTx, meta: { total: custTx.length } });
  }

  // ── All transactions ────────────────────────────────────────
  if (req.method === "GET" && rawPath === "/rails/transactions") {
    const [list, total] = await Promise.all([
      prisma.railsTransaction.findMany({ orderBy: { receivedAt: "desc" }, take: 200 }),
      prisma.railsTransaction.count(),
    ]);
    return json(res, 200, { success: true, data: list, meta: { total } });
  }

  // ── Wise Webhook ────────────────────────────────────────────
  if (req.method === "POST" && (rawPath === "/rails/webhook" || rawPath === "/wise/webhook")) {
    const rawBody = await readBody(req);
    const sig     = req.headers["x-signature-sha256"] || "";

    if (!verifySignature(rawBody, sig)) {
      console.warn("[rails] Invalid webhook signature");
      return json(res, 401, { error: "Invalid signature" });
    }

    let event;
    try { event = JSON.parse(rawBody.toString()); }
    catch { return json(res, 400, { error: "Invalid JSON" }); }

    const eventType  = event.event_type || event.type || "";
    const eventId    = event.id || event.delivery_id || `EVT-${Date.now()}`;
    const transferId = event.data?.incoming_transfer_id || event.data?.id || event.data?.transferId;

    console.log(`[rails] Webhook: ${eventType} | Transfer: ${transferId} | Event: ${eventId}`);

    if (eventType === "incoming-transfer#credited" && transferId) {
      // Acknowledge immediately — Wise needs fast response
      json(res, 200, { received: true, eventId, transferId });
      // Process asynchronously
      processAndPayout(transferId, eventId, event.data).then(result => {
        console.log(`[rails] Processed: ${result.status} | ${result.id || transferId}`);
      }).catch(err => {
        console.error(`[rails] Failed: ${err.message}`);
      });
      return;
    }

    return json(res, 200, { received: true, note: "Event type not processed by rails" });
  }

  // ── Manual payout trigger (admin) ───────────────────────────
  if (req.method === "POST" && rawPath === "/rails/manual-payout") {
    const { parsed } = await parseBody(req);
    const { customerId, amount, currency, reference } = parsed;

    if (!customerId || !amount) {
      return json(res, 422, { success: false, error: { message: "customerId and amount required" } });
    }
    const customer = await prisma.railsCustomer.findUnique({ where: { id: customerId } });
    if (!customer) return json(res, 404, { success: false, error: { message: "Customer not found" } });

    const payoutRef = reference || `MANUAL-${Date.now()}`;
    try {
      let payoutResult;
      if (WISE_API_KEY && WISE_PROFILE_ID) {
        payoutResult = await createWisePayout(customer, amount, currency || "USD", payoutRef, "Manual payout");
      } else {
        payoutResult = { simulated: true, id: `SIM-${Date.now()}`, status: "processing" };
      }
      return json(res, 200, { success: true, data: { payoutRef, payoutId: payoutResult.id, status: payoutResult.status } });
    } catch (err) {
      return json(res, 500, { success: false, error: { message: err.message } });
    }
  }

  // ── Sandbox simulate ────────────────────────────────────────
  if (req.method === "POST" && rawPath === "/rails/simulate") {
    if (WISE_ENV === "live") {
      return json(res, 403, { error: "Simulation only available in sandbox mode" });
    }
    const { parsed } = await parseBody(req);
    const testEventId    = `SIM-EVT-${Date.now()}`;
    const testTransferId = `SIM-TXN-${Date.now()}`;

    const fakeTransfer = {
      id:           testTransferId,
      amount:       { value: parseFloat(parsed.amount || 100), currency: parsed.currency || "USD" },
      senderDetails: { name: parsed.senderName || "Sandbox Sender" },
      reference:    parsed.reference || "SANDBOX-TEST",
      creditedAccountDetails: {
        iban:          parsed.wiseIBAN          || null,
        accountNumber: parsed.wiseAccountNumber || null,
      },
    };

    const result = await processAndPayout(testTransferId, testEventId, fakeTransfer);
    return json(res, 200, { success: true, data: result });
  }

  return json(res, 404, { error: "Not found", path: rawPath });
});

server.listen(PORT, process.env.RAILS_HOST || "127.0.0.1", async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         PrimeStack Payment Rails Service                  ║
╠═══════════════════════════════════════════════════════════╣
║  Health:       http://localhost:${PORT}/health                 ║
║  Webhook URL:  http://localhost:${PORT}/rails/webhook          ║
║  Customers:    http://localhost:${PORT}/rails/customers         ║
║  Transactions: http://localhost:${PORT}/rails/transactions      ║
║  Stats:        http://localhost:${PORT}/rails/stats             ║
║                                                           ║
║  Wise Env:   ${WISE_ENV.padEnd(49)}║
║  Configured: ${(!!WISE_API_KEY).toString().padEnd(49)}║
║                                                           ║
║  ARCHITECTURE: Pass-through rails — zero holding          ║
║  Incoming Wise transfer → instant payout to customer bank ║
╚═══════════════════════════════════════════════════════════╝
`);
  if (!WISE_API_KEY) {
    console.warn("⚠  WISE_API_KEY not set — running in simulation mode");
    console.warn("   Payouts will be simulated, not sent to real banks");
  }
  console.log(`[rails] Ready. ${await prisma.railsCustomer.count()} customers loaded.`);
});
