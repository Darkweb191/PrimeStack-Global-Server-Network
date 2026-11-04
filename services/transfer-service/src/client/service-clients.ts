/**
 * Service Clients
 *
 * HTTP clients for calling internal services.
 * Each client wraps fetch with timeouts and typed responses.
 *
 * In production these would use gRPC or a service mesh.
 * For now they use plain HTTP with connection pooling handled
 * by Node.js's built-in keep-alive.
 */

const LEDGER_URL  = process.env.LEDGER_SERVICE_URL  ?? "http://localhost:4001";
const RISK_URL    = process.env.RISK_SERVICE_URL    ?? "http://localhost:4006";
const TERMINAL_URL = process.env.TERMINAL_SERVICE_URL ?? "http://localhost:4004";

type ServiceResponse<T> =
  | { success: true;  data: T }
  | { success: false; error: { code: string; message: string } };

async function callService<T>(
  url:      string,
  method:   "GET" | "POST",
  body?:    object,
  timeoutMs = 10_000,
): Promise<ServiceResponse<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    body ? JSON.stringify(body) : undefined,
      signal:  AbortSignal.timeout(timeoutMs),
    });
    return await res.json() as ServiceResponse<T>;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Service call failed";
    return { success: false, error: { code: "SERVICE_UNAVAILABLE", message } };
  }
}

// ── Ledger Service Client ────────────────────────────────────

export interface LedgerEntryResult {
  entryId:   string;
  reference: string;
}

/**
 * Post a journal entry to the Ledger Service.
 * This is the call that actually moves money.
 */
export async function postLedgerEntry(input: {
  reference:   string;
  entryType:   string;
  description: string;
  source:      string;
  postedBy?:   string;
  lines: Array<{ accountId: string; debit: string; credit: string }>;
}): Promise<LedgerEntryResult> {

  const result = await callService<LedgerEntryResult>(
    `${LEDGER_URL}/entries`,
    "POST",
    input,
  );

  if (!result.success) {
    throw new Error(`Ledger error [${result.error.code}]: ${result.error.message}`);
  }

  return result.data;
}

export async function getLedgerBalance(accountId: string): Promise<{
  accountId:        string;
  availableBalance: string;
  heldBalance:      string;
  effectiveBalance: string;
  currency:         string;
}> {
  const result = await callService<{
    accountId: string; availableBalance: string; heldBalance: string;
    effectiveBalance: string; currency: string;
  }>(`${LEDGER_URL}/accounts/${accountId}/balance`, "GET");

  if (!result.success) {
    throw new Error(`Ledger balance error [${result.error.code}]: ${result.error.message}`);
  }
  return result.data;
}

export async function reverseLedgerEntry(
  reference: string,
  reason:    string,
  reversedBy?: string,
): Promise<LedgerEntryResult> {
  const result = await callService<LedgerEntryResult>(
    `${LEDGER_URL}/entries/${reference}/reverse`,
    "POST",
    { reason, reversedBy },
  );
  if (!result.success) {
    throw new Error(`Ledger reversal error [${result.error.code}]: ${result.error.message}`);
  }
  return result.data;
}

// ── Risk Service Client ──────────────────────────────────────

export interface RiskResult {
  verdict:       "ALLOW" | "REVIEW" | "BLOCK";
  riskScore:     number;
  riskLevel:     string;
  triggeredRules: string[];
  reason?:       string;
}

export async function evaluateRisk(input: {
  entityRef:   string;
  entityType:  "TRANSFER";
  amount:      string;
  currency:    string;
  sourceId?:   string;
  ipAddress?:  string;
  merchantId?: string;
}): Promise<RiskResult> {
  const result = await callService<RiskResult>(
    `${RISK_URL}/evaluate`,
    "POST",
    input,
    5_000, // 5s timeout — risk check must be fast
  );

  if (!result.success) {
    // Risk service unavailable — fail open for ALLOW, log the issue
    console.warn(`[transfer] risk service error: ${result.error.message} — proceeding with REVIEW`);
    return { verdict: "REVIEW", riskScore: 50, riskLevel: "MEDIUM", triggeredRules: ["RISK_SERVICE_UNAVAILABLE"] };
  }
  return result.data;
}

// ── Terminal Service Client ──────────────────────────────────

export interface TerminalRecord {
  id:             string;
  tid:            string;
  merchantId:     string;
  merchantCode:   string;
  merchantStatus: string;
  country:        string;
  status:         string;
}

export async function validateTerminal(tid: string): Promise<TerminalRecord> {
  const result = await callService<TerminalRecord>(
    `${TERMINAL_URL}/terminals/${tid}/validate`,
    "GET",
    undefined,
    3_000,
  );

  if (!result.success) {
    throw new Error(`Terminal validation failed [${result.error.code}]: ${result.error.message}`);
  }
  return result.data;
}
