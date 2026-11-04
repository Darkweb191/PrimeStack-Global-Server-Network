import { createServer, IncomingMessage, ServerResponse } from "http";
import { ConfigError, isConfigured, loadConfig } from "./config.js";
import { broadcastTrc20, BroadcasterError, type BroadcastResult } from "./tron.js";

/**
 * Crypto Payout Service — HTTP Server
 *
 * Single responsibility: turn a ledger crypto balance into a real
 * on-chain transfer. Flow is external-first:
 *
 *   1. fail-closed config check (501 if unconfigured — never simulate)
 *   2. ledger balance pre-check
 *   3. sign + broadcast the TRC-20 transfer  (external)
 *   4. post the matching double-entry ledger record (internal)
 *
 * Step 4 only runs if step 3 produced a real transaction hash.
 */

const PORT = parseInt(process.env.PORT ?? "4014", 10);
const LEDGER_SERVICE_URL = (process.env.LEDGER_SERVICE_URL ?? "http://localhost:4001").replace(/\/+$/, "");

/** Supported asset + the networks we can actually sign for. */
const SUPPORTED_ASSETS: Record<string, { networks: string[]; label: string }> = {
  USDT: { networks: ["TRC20", "TRC-20", "tron"], label: "Tether USD (TRC-20)" },
};

interface WithdrawRequest {
  asset?:     string;
  network?:   string;
  toAddress?: string;
  amount?:    string | number;
  memo?:      string;
  tag?:       string;
}

// ── HTTP helpers ─────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) { resolve(null); return; }
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

function send(res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function ok(res: ServerResponse, data: object, status = 200): void {
  send(res, status, { success: true, data });
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  send(res, status, { success: false, error: { code, message } });
}

// ── Ledger client ────────────────────────────────────────────

interface LedgerEntryResult { entryId: string; reference: string }

async function getLedgerBalance(accountNumber: string): Promise<number | null> {
  try {
    const r = await fetch(`${LEDGER_SERVICE_URL}/accounts/${encodeURIComponent(accountNumber)}/balance`);
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { availableBalance?: string } };
    const raw = j.data?.availableBalance;
    return raw === undefined ? null : Number(raw);
  } catch {
    return null;
  }
}

async function postLedgerEntry(payload: object): Promise<LedgerEntryResult> {
  const r = await fetch(`${LEDGER_SERVICE_URL}/entries`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const j = (await r.json()) as {
    success?: boolean;
    data?:    LedgerEntryResult;
    error?:   { message?: string };
  };
  if (!r.ok || !j.data) {
    throw new Error(j.error?.message ?? `ledger responded with HTTP ${r.status}`);
  }
  return j.data;
}

// ── Routes ───────────────────────────────────────────────────

async function handleWithdraw(res: ServerResponse, body: unknown): Promise<void> {
  const b = (body ?? {}) as WithdrawRequest;

  const asset     = (b.asset ?? "").trim().toUpperCase();
  const network   = (b.network ?? "").trim();
  const toAddress = (b.toAddress ?? "").trim();
  const amount    = b.amount === undefined ? "" : String(b.amount).trim();

  if (!asset || !network || !toAddress || !amount) {
    fail(res, 422, "MISSING_FIELDS", "asset, network, toAddress, and amount are required");
    return;
  }

  const spec = SUPPORTED_ASSETS[asset];
  if (!spec) {
    fail(res, 422, "UNSUPPORTED_ASSET", `No broadcaster for asset ${asset} (supported: ${Object.keys(SUPPORTED_ASSETS).join(", ")})`);
    return;
  }
  if (!spec.networks.includes(network)) {
    fail(res, 422, "UNSUPPORTED_NETWORK", `${asset} cannot be sent on network "${network}" (supported: ${spec.networks.join(", ")})`);
    return;
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    fail(res, 422, "INVALID_AMOUNT", `Amount must be a positive number: "${amount}"`);
    return;
  }

  // ── Fail-closed: refuse to proceed without real provider credentials ──
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      fail(res, 501, err.code, err.message);
      return;
    }
    throw err;
  }

  // ── Internal funds check before we touch the network ──
  const accountNumber = `CRYPTO:${asset}`;
  const balance = await getLedgerBalance(accountNumber);
  if (balance === null) {
    fail(res, 502, "LEDGER_UNAVAILABLE", `Could not read ledger balance for ${accountNumber}`);
    return;
  }
  if (numericAmount > balance) {
    fail(res, 409, "INSUFFICIENT_FUNDS", `Crypto wallet ${accountNumber} holds ${balance}, requested ${numericAmount}`);
    return;
  }

  // ── External-first: broadcast before we debit the ledger ──
  let tx: BroadcastResult;
  try {
    tx = await broadcastTrc20(cfg, toAddress, amount);
  } catch (err) {
    if (err instanceof BroadcasterError) {
      fail(res, 502, err.code, err.message);
      return;
    }
    throw err;
  }

  // ── Internal: record the double-entry for the dispatched funds ──
  const reference = `CRYPTO-OUT-${asset}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const entryPayload = {
    reference,
    entryType:   "PAYOUT",
    description: `On-chain withdrawal: ${amount} ${asset} to ${toAddress} via ${network} — ${tx.txHash}`,
    source:      "crypto_payout",
    metadata: {
      asset, network, amount, toAddress,
      txHash: tx.txHash, status: tx.status, blockNumber: tx.blockNumber,
      memo: b.memo ?? null, tag: b.tag ?? null,
    },
    lines: [
      { accountId: `CRYPTO:${asset}`,        debit: amount, credit: "0" },
      { accountId: `CRYPTO:PAYOUT:${asset}`, debit: "0",   credit: amount },
    ],
  };

  try {
    const entry = await postLedgerEntry(entryPayload);
    ok(res, { ...tx, ledgerReference: entry.reference, ledgerEntryId: entry.entryId }, 201);
  } catch (err) {
    // Broadcast succeeded but the ledger write failed — surface loudly so
    // the operator can reconcile rather than silently lose the record.
    const message = err instanceof Error ? err.message : String(err);
    fail(res, 502, "LEDGER_POST_FAILED",
      `Broadcast succeeded (tx ${tx.txHash}) but the ledger entry failed: ${message}`);
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? "GET";
  const url    = (req.url ?? "/").split("?")[0];

  if (method === "GET" && url === "/health") {
    ok(res, { status: "ok", service: "crypto-payout-service", configured: isConfigured() });
    return;
  }

  if (method === "POST" && url === "/withdraw") {
    const body = await readBody(req);
    try {
      await handleWithdraw(res, body);
    } catch (err) {
      console.error("[crypto-payout-service] unhandled error:", err);
      if (!res.headersSent) fail(res, 500, "INTERNAL_ERROR", "Internal server error");
    }
    return;
  }

  fail(res, 404, "NOT_FOUND", `${method} ${url} not found`);
});

server.listen(PORT, () => {
  console.log(`[crypto-payout-service] listening on port ${PORT} (configured=${isConfigured()})`);
});

process.on("SIGTERM", () => {
  server.close(() => { console.log("[crypto-payout-service] shutdown complete"); process.exit(0); });
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
