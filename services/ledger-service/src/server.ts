import { createServer, IncomingMessage, ServerResponse } from "http";
import { createPool } from "./db/pool.js";
import { buildHandlers } from "./api/routes.js";

/**
 * Ledger Service — HTTP Server
 *
 * Minimal Node.js HTTP server. No framework dependencies.
 * The fewer the moving parts in a financial core service,
 * the fewer the failure modes.
 *
 * In production this would expose gRPC for internal calls,
 * with this HTTP interface for admin tooling only.
 */

const PORT = parseInt(process.env.PORT ?? "4001", 10);
const pool = createPool();
const handlers = buildHandlers(pool);

/** Parse request body as JSON. Returns null if body is empty or invalid. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) { resolve(null); return; }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/** Extract the IP address from the request, respecting proxy headers. */
function getIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Match a URL path against a route pattern.
 * Supports `:param` segments.
 * Returns a params map if matched, null otherwise.
 *
 * Examples:
 *   match("/entries/REF-001", "/entries/:ref") → { ref: "REF-001" }
 *   match("/health",          "/health")        → {}
 */
function matchRoute(
  url: string,
  pattern: string,
): Record<string, string> | null {
  const urlParts     = url.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (urlParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (p !== urlParts[i]) {
      return null;
    }
  }

  return params;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method  = req.method ?? "GET";
  const rawUrl  = req.url ?? "/";
  const url     = rawUrl.split("?")[0]; // strip query string
  const ip      = getIp(req);

  // Route matching
  for (const [routeKey, handler] of handlers) {
    const [routeMethod, routePath] = routeKey.split(" ") as [string, string];

    if (routeMethod !== method) continue;

    const params = matchRoute(url, routePath);
    if (params === null) continue;

    // Attach params so handlers can read them
    (req as IncomingMessage & { params?: Record<string, string> }).params = params;

    const body = method !== "GET" ? await readBody(req) : null;

    try {
      await handler(req, res, body, ip);
    } catch (err) {
      // Handler threw — the route handler is responsible for calling
      // handleError(), but if it propagated here, return 500
      console.error("[ledger-server] unhandled exception in handler:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
      }
    }

    return;
  }

  // No route matched
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: `${method} ${url} not found` } }));
});

server.listen(PORT, () => {
  console.log(`[ledger-service] listening on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[ledger-service] shutting down...");
  server.close(async () => {
    await pool.end();
    console.log("[ledger-service] shutdown complete");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
