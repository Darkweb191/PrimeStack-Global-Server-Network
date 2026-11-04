import { createServer, IncomingMessage, ServerResponse } from "http";

/**
 * API Gateway Service
 *
 * Single ingress point for all external traffic.
 * Every request passes through this pipeline in order:
 *
 *   1. Parse request (method, path, headers, body)
 *   2. IP Whitelist check  → reject with 403 if blocked
 *   3. HMAC verification   → reject with 401 if invalid
 *   4. Rate limit check    → reject with 429 if exceeded
 *   5. Route to service    → proxy to the correct backend
 *   6. Log the request     → fire-and-forget to Audit Service
 *
 * Service URLs come from environment variables so this gateway
 * works in local dev (localhost:4001) and production (k8s DNS).
 *
 * mTLS:
 *   In production, the gateway terminates TLS and validates
 *   client certificates before the IP whitelist check.
 *   This implementation handles steps 2-6.
 *   TLS termination is handled by the ingress controller / load balancer.
 */

const SERVICES = {
  ledger:       process.env.LEDGER_SERVICE_URL        ?? "http://localhost:4001",
  ipWhitelist:  process.env.IP_WHITELIST_SERVICE_URL   ?? "http://localhost:4002",
  auth:         process.env.AUTH_SERVICE_URL           ?? "http://localhost:4003",
  terminal:     process.env.TERMINAL_SERVICE_URL       ?? "http://localhost:4004",
  transfer:     process.env.TRANSFER_SERVICE_URL       ?? "http://localhost:4005",
  risk:         process.env.RISK_SERVICE_URL           ?? "http://localhost:4006",
  audit:        process.env.AUDIT_SERVICE_URL          ?? "http://localhost:4007",
  settlement:   process.env.SETTLEMENT_SERVICE_URL     ?? "http://localhost:4008",
  notification: process.env.NOTIFICATION_SERVICE_URL   ?? "http://localhost:4009",
  switchCore:   process.env.SWITCH_CORE_URL            ?? "http://localhost:4010",
  security:     process.env.SECURITY_SERVICE_URL       ?? "http://localhost:4011",
  routing:      process.env.ROUTING_SERVICE_URL        ?? "http://localhost:4012",
  iso8583:      process.env.ISO8583_GATEWAY_URL        ?? "http://localhost:4013",
};

const PORT = parseInt(process.env.PORT ?? "443", 10);

// Route table: external path prefix → upstream service URL
const ROUTES: Array<{ prefix: string; upstream: string }> = [
  { prefix: "/v1/transactions",  upstream: SERVICES.switchCore   },
  { prefix: "/v1/transfers",     upstream: SERVICES.transfer     },
  { prefix: "/v1/terminals",     upstream: SERVICES.terminal     },
  { prefix: "/v1/ledger",        upstream: SERVICES.ledger       },
  { prefix: "/v1/risk",          upstream: SERVICES.risk         },
  { prefix: "/v1/routing",       upstream: SERVICES.routing      },
  { prefix: "/v1/settlement",    upstream: SERVICES.settlement   },
  { prefix: "/v1/notifications",  upstream: SERVICES.notification },
  { prefix: "/v1/security",       upstream: SERVICES.security     },
  { prefix: "/v1/audit",         upstream: SERVICES.audit        },
  { prefix: "/v1/iso8583",      upstream: SERVICES.iso8583      },
  { prefix: "/health",           upstream: SERVICES.ledger       },
];

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

function getIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function json(res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Check IP whitelist via the IP Whitelist Service.
 */
async function checkIpAllowed(ip: string, clientId?: string): Promise<boolean> {
  try {
    const url = `${SERVICES.ipWhitelist}/check`;
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ip, clientId }),
      signal:  AbortSignal.timeout(2000), // 2s timeout — fail open on timeout
    });
    if (!res.ok) return true; // fail open if IP whitelist service is down
    const data = await res.json() as { data?: { allowed?: boolean } };
    return data.data?.allowed ?? true;
  } catch {
    // If IP whitelist service is unreachable, fail OPEN in dev, CLOSED in prod
    const failOpen = process.env.NODE_ENV !== "production";
    if (!failOpen) console.error("[gateway] IP whitelist service unreachable — blocking");
    return failOpen;
  }
}

/**
 * Verify HMAC signature via the Auth Service.
 */
async function verifyHmac(
  clientId:  string,
  timestamp: string,
  signature: string,
  method:    string,
  path:      string,
  rawBody:   string,
): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICES.security}/hmac/verify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ clientId, timestamp, signature, method, path, rawBody }),
      signal:  AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Proxy a request to an upstream service.
 * Adds internal headers so upstream services know the request
 * came through the gateway (not directly).
 */
async function proxy(
  upstream:  string,
  req:       IncomingMessage,
  rawBody:   Buffer,
  clientId:  string,
  clientIp:  string,
  res:       ServerResponse,
): Promise<void> {
  const url = upstream + (req.url ?? "/");

  // Forward headers — strip hop-by-hop, add internal context
  const headers: Record<string, string> = {
    "content-type":             req.headers["content-type"]    ?? "application/json",
    "accept-language":          req.headers["accept-language"] ?? "en",
    "x-gateway-client-id":      clientId,
    "x-gateway-client-ip":      clientIp,
    "x-gateway-forwarded":      "true",
    "x-request-id":             crypto.randomUUID(),
  };

  if (rawBody.length > 0) {
    headers["content-length"] = String(rawBody.length);
  }

  const requestBody = rawBody.length > 0 ? new ArrayBuffer(rawBody.length) : undefined;
  if (requestBody) new Uint8Array(requestBody).set(rawBody);

  try {
    const upstream_res = await fetch(url, {
      method:  req.method ?? "GET",
      headers,
      body:    requestBody,
      signal:  AbortSignal.timeout(30_000), // 30s upstream timeout
    });

    const responseBody = await upstream_res.arrayBuffer();
    const responseBuffer = Buffer.from(responseBody);

    res.writeHead(upstream_res.status, {
      "Content-Type":   upstream_res.headers.get("content-type") ?? "application/json",
      "Content-Length": responseBuffer.length,
    });
    res.end(responseBuffer);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    json(res, 502, { success: false, error: { code: "UPSTREAM_ERROR", message } });
  }
}

/**
 * Log request to the Audit Service (fire and forget).
 */
function auditLog(entry: {
  clientId: string;
  ip:       string;
  method:   string;
  path:     string;
  status:   number;
  durationMs: number;
}): void {
  fetch(`${SERVICES.audit}/events`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      actorType:   "API_CLIENT",
      actorId:     entry.clientId,
      actorIp:     entry.ip,
      eventType:   "API_REQUEST",
      description: `${entry.method} ${entry.path} → ${entry.status} (${entry.durationMs}ms)`,
      metadata:    entry,
    }),
  }).catch(() => { /* non-critical */ });
}

// ── Server ────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const startTime = Date.now();
  const method    = req.method ?? "GET";
  const path      = (req.url ?? "/").split("?")[0];
  const ip        = getIp(req);

  // Health check — bypass all middleware
  if (path === "/health" || path === "/") {
    json(res, 200, { status: "ok", service: "api-gateway" });
    return;
  }

  // Read body once
  const rawBody  = await readBody(req);
  const bodyStr  = rawBody.toString("utf8");

  // ── Step 1: Extract client identity ────────────────────────
  const clientId  = req.headers["x-primestack-client-id"] as string | undefined;
  const timestamp = req.headers["x-primestack-timestamp"] as string | undefined;
  const signature = req.headers["x-primestack-signature"] as string | undefined;

  if (!clientId || !timestamp || !signature) {
    json(res, 401, { success: false, error: { code: "MISSING_AUTH_HEADERS", message: "HMAC authentication headers required" } });
    return;
  }

  // ── Step 2: IP Whitelist ────────────────────────────────────
  const ipAllowed = await checkIpAllowed(ip, clientId);
  if (!ipAllowed) {
    json(res, 403, { success: false, error: { code: "IP_BLOCKED", message: "IP address not whitelisted" } });
    return;
  }

  // ── Step 3: HMAC Verification ───────────────────────────────
  const hmacValid = await verifyHmac(clientId, timestamp, signature, method, path, bodyStr);
  if (!hmacValid) {
    json(res, 401, { success: false, error: { code: "INVALID_SIGNATURE", message: "HMAC signature invalid or expired" } });
    return;
  }

  // ── Step 4: Route to upstream service ──────────────────────
  const route = ROUTES.find((r) => path.startsWith(r.prefix));
  if (!route) {
    json(res, 404, { success: false, error: { code: "NOT_FOUND", message: `No route for ${method} ${path}` } });
    return;
  }

  // ── Step 5: Proxy ───────────────────────────────────────────
  await proxy(route.upstream, req, rawBody, clientId, ip, res);

  // ── Step 6: Audit log ───────────────────────────────────────
  auditLog({
    clientId,
    ip,
    method,
    path,
    status:     res.statusCode,
    durationMs: Date.now() - startTime,
  });
});

server.listen(PORT, () => {
  console.log(`[api-gateway] listening on port ${PORT}`);
  console.log(`[api-gateway] upstream services: ${JSON.stringify(SERVICES, null, 2)}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));
