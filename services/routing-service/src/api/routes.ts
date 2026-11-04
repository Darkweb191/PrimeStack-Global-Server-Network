import { IncomingMessage, ServerResponse } from "http";
import { Pool }     from "pg";
import * as Routing from "../domain/routing.js";
import { send }     from "../../../shared/src/http-server.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

const ok       = (r: ServerResponse, d: unknown) => send(r, 200, { success: true, data: d });
const created  = (r: ServerResponse, d: unknown) => send(r, 201, { success: true, data: d });
const fail     = (r: ServerResponse, s: number, c: string, m: string) => send(r, s, { success: false, error: { code: c, message: m } });
const err500   = (r: ServerResponse, e: unknown) => {
  console.error("[routing-api]", e);
  send(r, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};

export function buildRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [
    // ── Health ────────────────────────────────────────────────
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) => ok(res, { status: "ok", service: "routing-service" }),
    },

    // ── Core: resolve route (called by switch-core) ────────────
    {
      method: "POST", pattern: "/route",
      handler: async (_req, res, body) => {
        try {
          const b = body as Routing.RouteInput;
          if (!b?.txRef || !b?.txType || !b?.amount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "txRef, txType, amount, currency required");

          const decision = await Routing.resolveRoute(pool, b);
          if (!decision) {
            return send(res, 200, {
              success: false,
              error: { code: "NO_ROUTE", message: "No route found — decline with ISO code 92" },
            });
          }
          ok(res, decision);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Routes CRUD ───────────────────────────────────────────
    {
      method: "GET", pattern: "/routes",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const result = await Routing.listRoutes(pool, qs.get("activeOnly") !== "false");
          ok(res, result.rows);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/routes",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Routing.createRoute>[1];
          if (!b?.routeName || !b?.routeType || !b?.destination)
            return fail(res, 422, "MISSING_FIELDS", "routeName, routeType, destination required");
          const result = await Routing.createRoute(pool, b);
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "PATCH", pattern: "/routes/:id",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { priority?: number; failoverId?: string; active?: boolean };
          await pool.query(
            `UPDATE routes SET
               priority    = COALESCE($1, priority),
               failover_id = COALESCE($2, failover_id),
               active      = COALESCE($3, active),
               updated_at  = NOW()
             WHERE id = $4`,
            [b.priority ?? null, b.failoverId ?? null, b.active ?? null, params.id],
          );
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "DELETE", pattern: "/routes/:id",
      handler: async (_req, res, _b, params) => {
        try {
          await pool.query("UPDATE routes SET active = FALSE, updated_at = NOW() WHERE id = $1", [params.id]);
          ok(res, { disabled: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Connections CRUD ──────────────────────────────────────
    {
      method: "GET", pattern: "/connections",
      handler: async (_req, res) => {
        try {
          const result = await Routing.listConnections(pool);
          ok(res, result.rows);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/connections",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Routing.createConnection>[1];
          if (!b?.connectionName || !b?.protocol || !b?.host || !b?.port)
            return fail(res, 422, "MISSING_FIELDS", "connectionName, protocol, host, port required");
          const result = await Routing.createConnection(pool, b);
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "PATCH", pattern: "/connections/:id",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { active?: boolean; timeoutMs?: number; retries?: number };
          await pool.query(
            "UPDATE connections SET active = COALESCE($1,active), timeout_ms = COALESCE($2,timeout_ms), retries = COALESCE($3,retries), updated_at = NOW() WHERE id = $4",
            [b.active ?? null, b.timeoutMs ?? null, b.retries ?? null, params.id],
          );
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Rules CRUD ────────────────────────────────────────────
    {
      method: "GET", pattern: "/rules",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const result = await Routing.listRules(pool, qs.get("activeOnly") !== "false");
          ok(res, result.rows);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/rules",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Routing.createRule>[1];
          if (!b?.ruleName || !b?.routeId)
            return fail(res, 422, "MISSING_FIELDS", "ruleName, routeId required");
          const result = await Routing.createRule(pool, b);
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "PATCH", pattern: "/rules/:id",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { isActive?: boolean; priority?: number };
          await pool.query(
            "UPDATE routing_rules SET is_active = COALESCE($1,is_active), priority = COALESCE($2,priority), updated_at = NOW() WHERE id = $3",
            [b.isActive ?? null, b.priority ?? null, params.id],
          );
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "DELETE", pattern: "/rules/:id",
      handler: async (_req, res, _b, params) => {
        await pool.query("UPDATE routing_rules SET is_active = FALSE, updated_at = NOW() WHERE id = $1", [params.id]);
        ok(res, { disabled: true });
      },
    },

    // ── Merchant / Terminal route assignment ──────────────────
    {
      method: "POST", pattern: "/merchant-routes",
      handler: async (_req, res, body) => {
        try {
          const b = body as { merchantId: string; routeId: string; priority?: number };
          if (!b?.merchantId || !b?.routeId)
            return fail(res, 422, "MISSING_FIELDS", "merchantId, routeId required");
          await Routing.assignMerchantRoute(pool, b.merchantId, b.routeId, b.priority);
          created(res, { assigned: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/terminal-routes",
      handler: async (_req, res, body) => {
        try {
          const b = body as { terminalId: string; routeId: string; priority?: number };
          if (!b?.terminalId || !b?.routeId)
            return fail(res, 422, "MISSING_FIELDS", "terminalId, routeId required");
          await Routing.assignTerminalRoute(pool, b.terminalId, b.routeId, b.priority);
          created(res, { assigned: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Health management ─────────────────────────────────────
    {
      method: "POST", pattern: "/routes/:id/health",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { success: boolean; responseMs: number; error?: string };
          if (b?.success === undefined || b?.responseMs === undefined)
            return fail(res, 422, "MISSING_FIELDS", "success, responseMs required");
          await Routing.recordRouteOutcome(pool, params.id, b.success, b.responseMs, b.error);
          ok(res, { recorded: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/routes/:id/ping",
      handler: async (_req, res, _b, params) => {
        try {
          const result = await Routing.runHealthCheck(pool, params.id);
          ok(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "GET", pattern: "/health-summary",
      handler: async (_req, res) => {
        const rows = await pool.query(
          `SELECT r.id, r.route_name, r.route_type, r.priority,
                  h.status, h.response_ms, h.success_count, h.failure_count,
                  h.last_success_at, h.last_failure_at, h.last_error, h.checked_at
           FROM routes r
           LEFT JOIN route_health h ON h.route_id = r.id
           WHERE r.active = TRUE
           ORDER BY r.priority ASC`,
        );
        ok(res, rows.rows);
      },
    },

    // ── Traffic analytics ──────────────────────────────────────
    {
      method: "GET", pattern: "/traffic",
      handler: async (req, res) => {
        try {
          const qs    = new URL(`http://x${req.url}`).searchParams;
          const hours = parseInt(qs.get("hours") ?? "24", 10);
          const result = await Routing.getTrafficStats(pool, hours);
          ok(res, result.rows);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Routing log ───────────────────────────────────────────
    {
      method: "GET", pattern: "/log",
      handler: async (req, res) => {
        try {
          const qs    = new URL(`http://x${req.url}`).searchParams;
          const limit = Math.min(parseInt(qs.get("limit") ?? "100", 10), 500);
          const rows  = await pool.query(
            `SELECT * FROM routing_log ORDER BY created_at DESC LIMIT $1`,
            [limit],
          );
          ok(res, rows.rows);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Message queues ────────────────────────────────────────
    {
      method: "GET", pattern: "/queues",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT * FROM message_queues ORDER BY queue_name");
        ok(res, rows.rows);
      },
    },

    // ── Dashboard ─────────────────────────────────────────────
    {
      method: "GET", pattern: "/dashboard",
      handler: async (_req, res) => {
        try {
          const data = await Routing.getDashboard(pool);
          ok(res, data);
        } catch (e) { err500(res, e); }
      },
    },
  ];
}
