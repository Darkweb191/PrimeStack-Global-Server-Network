import { IncomingMessage, ServerResponse } from "http";
import { Pool }  from "pg";
import * as T    from "../domain/terminal.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

function ok(res: ServerResponse, data: unknown): void {
  send(res, 200, { success: true, data });
}
function created(res: ServerResponse, data: unknown): void {
  send(res, 201, { success: true, data });
}
function fail(res: ServerResponse, status: number, code: string, message: string): void {
  send(res, status, { success: false, error: { code, message } });
}
function send(res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}
function handleError(res: ServerResponse, err: unknown): void {
  if (err instanceof T.TerminalError) {
    const status = { TERMINAL_NOT_FOUND:404, MERCHANT_NOT_FOUND:404, TID_CONFLICT:409, CANNOT_ACTIVATE:409 }[err.code] ?? 422;
    fail(res, status, err.code, err.message);
    return;
  }
  console.error("[terminal-api] error:", err);
  fail(res, 500, "INTERNAL_ERROR", "Internal server error");
}

export function buildRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) => { ok(res, { status: "ok", service: "terminal-service" }); },
    },
    {
      method: "GET", pattern: "/merchants",
      handler: async (_req, res) => {
        try {
          const result = await pool.query(
            "SELECT id, merchant_code, legal_name, status FROM merchants WHERE status = 'ACTIVE' ORDER BY merchant_code",
          );
          ok(res, result.rows);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /merchants — create a new merchant (ops/onboarding use only)
      method: "POST", pattern: "/merchants",
      handler: async (_req, res, body) => {
        try {
          const b = body as { merchantCode?: string; businessName?: string; legalName?: string; mcc?: string; status?: string };
          if (!b?.merchantCode || !(b.businessName || b.legalName)) {
            fail(res, 422, "MISSING_FIELDS", "merchantCode and businessName are required");
            return;
          }
          const result = await pool.query(
            `INSERT INTO merchants (merchant_code, legal_name, mcc, status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (merchant_code) DO UPDATE SET legal_name=$2, mcc=$3, updated_at=NOW()
             RETURNING id, merchant_code, legal_name, mcc, status, created_at`,
            [b.merchantCode, b.businessName || b.legalName, b.mcc || "5999", b.status || "ACTIVE"],
          );
          created(res, result.rows[0]);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      method: "GET", pattern: "/terminals",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const search = qs.get("q")?.trim() || null;
          const status = qs.get("status") || null;
          const requestedLimit = Number.parseInt(qs.get("limit") ?? "100", 10);
          const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
          const result = await pool.query(
            `SELECT t.id, t.tid, t.serial_number, t.model, t.firmware_version,
                    t.status, t.last_seen_at, t.country, t.location_label,
                    m.merchant_code, m.legal_name AS merchant_name,
                    h.status AS health_status, h.heartbeat_at,
                    h.cpu_usage_pct, h.memory_usage_pct, h.disk_usage_pct,
                    h.battery_level_pct, h.network_latency_ms, h.error_code
             FROM terminals t
             JOIN merchants m ON m.id = t.merchant_id
             LEFT JOIN terminal_health h ON h.terminal_id = t.id
             WHERE ($1::text IS NULL OR t.status = $1)
               AND ($2::text IS NULL OR
                    t.tid ILIKE '%' || $2 || '%' OR
                    t.serial_number ILIKE '%' || $2 || '%' OR
                    t.model ILIKE '%' || $2 || '%' OR
                    m.merchant_code ILIKE '%' || $2 || '%' OR
                    m.legal_name ILIKE '%' || $2 || '%')
             ORDER BY t.updated_at DESC, t.tid
             LIMIT $3`,
            [status, search, limit],
          );
          ok(res, result.rows);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /terminals — register a terminal
      method: "POST", pattern: "/terminals",
      handler: async (_req, res, body) => {
        try {
          const b = body as {
            tid: string; merchantId: string; serialNumber: string;
            model?: string; firmwareVersion?: string; country?: string;
            timezone?: string; locationLabel?: string; publicKey?: string;
          };
          if (!b?.tid || !b?.merchantId || !b?.serialNumber)
            return fail(res, 422, "MISSING_FIELDS", "tid, merchantId, and serialNumber are required");
          const result = await T.register(pool, b);
          created(res, result);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /terminals/:tid/activate
      method: "POST", pattern: "/terminals/:tid/activate",
      handler: async (_req, res, _body, params) => {
        try {
          await T.activate(pool, params.tid);
          ok(res, { activated: true, tid: params.tid });
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // GET /terminals/:tid/validate — critical path for transaction auth
      method: "GET", pattern: "/terminals/:tid/validate",
      handler: async (_req, res, _body, params) => {
        try {
          const record = await T.validate(pool, params.tid);
          ok(res, record);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // GET /terminals/:tid — full status
      method: "GET", pattern: "/terminals/:tid",
      handler: async (_req, res, _body, params) => {
        try {
          const status = await T.getStatus(pool, params.tid);
          ok(res, status);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /terminals/:tid/heartbeat
      method: "POST", pattern: "/terminals/:tid/heartbeat",
      handler: async (_req, res, body, params) => {
        try {
          const b = (body ?? {}) as Parameters<typeof T.heartbeat>[2];
          await T.heartbeat(pool, params.tid, b);
          // Return any pending commands with the heartbeat response
          const commands = await T.pollCommands(pool, params.tid);
          ok(res, { received: true, commands });
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /terminals/:tid/commands — queue a remote command
      method: "POST", pattern: "/terminals/:tid/commands",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { command: string; payload?: Record<string,unknown>; expiresInMinutes?: number };
          if (!b?.command) return fail(res, 422, "MISSING_FIELDS", "command is required");
          const result = await T.queueCommand(pool, params.tid, b.command, b.payload, b.expiresInMinutes);
          created(res, result);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /commands/:commandId/ack
      method: "POST", pattern: "/commands/:commandId/ack",
      handler: async (_req, res, _body, params) => {
        try {
          await T.ackCommand(pool, params.commandId);
          ok(res, { acked: true });
        } catch (err) { handleError(res, err); }
      },
    },
  ];
}
