import { IncomingMessage, ServerResponse } from "http";
import { Pool }          from "pg";
import { ConnectionPool } from "../network/connection-manager.js";
import * as Gateway      from "../domain/gateway.js";
import { parse, build, buildResponse, MTI_NAMES, FIELD_DEFS } from "../parser/iso8583.js";
import { operationsDashboardHtml } from "../ui/operations-dashboard.js";
import { send }          from "../../../shared/src/http-server.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

const ok      = (r: ServerResponse, d: unknown) => send(r, 200, { success: true, data: d });
const created = (r: ServerResponse, d: unknown) => send(r, 201, { success: true, data: d });
const fail    = (r: ServerResponse, s: number, c: string, m: string) =>
  send(r, s, { success: false, error: { code: c, message: m } });
const err500  = (r: ServerResponse, e: unknown) => {
  console.error("[iso8583-api]", e);
  send(r, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};

export function buildRoutes(pool: Pool, connPool: ConnectionPool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [

    { method: "GET", pattern: "/health",
      handler: async (_req, res) => ok(res, {
        status: "ok", service: "iso8583-gateway",
        connections: connPool.getStatus(),
      }),
    },

    // ── Message Processing ────────────────────────────────────

    // POST /process — process an inbound ISO 8583 hex message
    { method: "POST", pattern: "/process",
      handler: async (_req, res, body) => {
        try {
          const b = body as { hexMessage: string; hostId: string };
          if (!b?.hexMessage || !b?.hostId)
            return fail(res, 422, "MISSING_FIELDS", "hexMessage, hostId required");
          const responseHex = await Gateway.processInbound(pool, connPool, b.hexMessage, b.hostId);
          ok(res, { responseHex });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Parser (developer tool) ───────────────────────────────

    // POST /parse — parse a hex message to JSON fields
    { method: "POST", pattern: "/parse",
      handler: async (_req, res, body) => {
        try {
          const b = body as { hexMessage: string; hasLengthHeader?: boolean };
          if (!b?.hexMessage) return fail(res, 422, "MISSING_FIELDS", "hexMessage required");
          const parsed = parse(b.hexMessage, b.hasLengthHeader ?? true);
          ok(res, {
            mti:         parsed.mti,
            mtiName:     MTI_NAMES[parsed.mti] ?? "Unknown",
            bitmap:      parsed.bitmap,
            fields:      Object.fromEntries(parsed.fields),
            fieldNames:  Object.fromEntries([...parsed.fields.keys()].map(k => [k, FIELD_DEFS.get(k)?.name ?? `Field ${k}`])),
            parseErrors: parsed.parseErrors,
            rawLength:   parsed.rawHex.length / 2,
          });
        } catch (e) { err500(res, e); }
      },
    },

    // POST /build — build a hex message from MTI and fields
    { method: "POST", pattern: "/build",
      handler: async (_req, res, body) => {
        try {
          const b = body as { mti: string; fields: Record<string, string>; addLengthHeader?: boolean };
          if (!b?.mti || !b?.fields) return fail(res, 422, "MISSING_FIELDS", "mti, fields required");
          const fieldMap = new Map(Object.entries(b.fields).map(([k, v]) => [parseInt(k), v]));
          const hex      = build({ mti: b.mti, fields: fieldMap }, b.addLengthHeader ?? true);
          ok(res, { hexMessage: hex, length: hex.length / 2 });
        } catch (e) { err500(res, e); }
      },
    },

    // POST /simulate — simulate a full request/response cycle (testing)
    { method: "POST", pattern: "/simulate",
      handler: async (_req, res, body) => {
        try {
          const b = body as { mti: string; fields: Record<string, string> };
          if (!b?.mti) return fail(res, 422, "MISSING_FIELDS", "mti required");

          const fieldMap = new Map(Object.entries(b.fields ?? {}).map(([k,v]) => [parseInt(k), v]));
          const request  = { mti: b.mti, fields: fieldMap };
          const requestHex = build(request, true);

          // Simulate: parse the request then build response 00
          const parsed      = parse(requestHex, true);
          const responseMsg = buildResponse(parsed, "00");
          const responseHex = build(responseMsg, true);
          const responseParsed = parse(responseHex, true);

          ok(res, {
            request:  { hex: requestHex,  fields: Object.fromEntries(fieldMap) },
            response: { hex: responseHex, fields: Object.fromEntries(responseParsed.fields) },
          });
        } catch (e) { err500(res, e); }
      },
    },

    // GET /mti — list all known MTI codes
    { method: "GET", pattern: "/mti",
      handler: async (_req, res) =>
        ok(res, Object.entries(MTI_NAMES).map(([code, name]) => ({ code, name }))),
    },

    // GET /fields — list all known field definitions
    { method: "GET", pattern: "/fields",
      handler: async (_req, res) =>
        ok(res, [...FIELD_DEFS.values()]),
    },

    // ── Host Management ───────────────────────────────────────

    { method: "GET", pattern: "/hosts",
      handler: async (_req, res) => {
        try { ok(res, (await Gateway.listHosts(pool)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/hosts",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Gateway.createHost>[1];
          if (!b?.hostName || !b?.hostType || !b?.protocol || !b?.hostname || !b?.port)
            return fail(res, 422, "MISSING_FIELDS", "hostName, hostType, protocol, hostname, port required");
          created(res, await Gateway.createHost(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "PATCH", pattern: "/hosts/:id/status",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { status: string; error?: string };
          if (!b?.status) return fail(res, 422, "MISSING_FIELDS", "status required");
          await Gateway.updateHostStatus(pool, params.id, b.status, b.error);
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    // POST /hosts/:id/connect — trigger manual reconnect
    { method: "POST", pattern: "/hosts/:id/connect",
      handler: async (_req, res, _b, params) => {
        try {
          const status = connPool.getStatus().find(s => s.hostId === params.id);
          ok(res, { hostId: params.id, poolStatus: status ?? { connected: 0, total: 0 } });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Failover ──────────────────────────────────────────────

    { method: "POST", pattern: "/failover",
      handler: async (_req, res, body) => {
        try {
          const b = body as { primaryId: string; secondaryId: string; priority?: number; triggerCodes?: string[] };
          if (!b?.primaryId || !b?.secondaryId)
            return fail(res, 422, "MISSING_FIELDS", "primaryId, secondaryId required");
          await Gateway.setFailover(pool, b.primaryId, b.secondaryId, b.priority, b.triggerCodes);
          ok(res, { configured: true });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/failover",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT nf.*, h1.host_name as primary_name, h2.host_name as secondary_name FROM network_failover nf JOIN hosts h1 ON h1.id = nf.primary_host JOIN hosts h2 ON h2.id = nf.secondary_host ORDER BY priority");
        ok(res, rows.rows);
      },
    },

    // ── Sessions & Network Health ─────────────────────────────

    { method: "GET", pattern: "/sessions",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT ns.*, h.host_name FROM network_sessions ns JOIN hosts h ON h.id = ns.host_id ORDER BY ns.last_seen DESC");
        ok(res, rows.rows);
      },
    },

    { method: "GET", pattern: "/health/network",
      handler: async (_req, res) => {
        const rows = await pool.query(
          `SELECT h.host_name, h.status, nh.* FROM network_health nh JOIN hosts h ON h.id = nh.host_id ORDER BY h.host_name`,
        );
        ok(res, rows.rows);
      },
    },

    { method: "GET", pattern: "/health/history/:hostId",
      handler: async (req, res, _b, params) => {
        const qs    = new URL(`http://x${req.url}`).searchParams;
        const hours = parseInt(qs.get("hours") ?? "24", 10);
        const rows  = await pool.query(
          "SELECT * FROM network_health_history WHERE host_id = $1 AND bucket_hour > NOW() - ($2 || ' hours')::INTERVAL ORDER BY bucket_hour ASC",
          [params.hostId, hours],
        );
        ok(res, rows.rows);
      },
    },

    // ── Messages & Journal ────────────────────────────────────

    { method: "GET", pattern: "/messages",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Gateway.listMessages(pool, {
            direction: qs.get("direction") ?? undefined,
            mti:       qs.get("mti")       ?? undefined,
            hostId:    qs.get("hostId")    ?? undefined,
            status:    qs.get("status")    ?? undefined,
            page:      parseInt(qs.get("page")     ?? "1",  10),
            pageSize:  parseInt(qs.get("pageSize") ?? "50", 10),
          });
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/journal/:reference",
      handler: async (_req, res, _b, params) => {
        try {
          const rows = await Gateway.getTransactionJournal(pool, params.reference);
          ok(res, rows.rows);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Metrics & Dashboard ───────────────────────────────────

    { method: "GET", pattern: "/metrics",
      handler: async (req, res) => {
        const qs = new URL(`http://x${req.url}`).searchParams;
        const rows = await pool.query(
          "SELECT * FROM transaction_metrics WHERE business_day >= ($1::date - '30 days'::interval) ORDER BY business_day DESC",
          [qs.get("from") ?? new Date().toISOString().split("T")[0]],
        );
        ok(res, rows.rows);
      },
    },

    { method: "GET", pattern: "/operations",
      handler: async (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(operationsDashboardHtml),
          "Cache-Control": "no-store",
        });
        res.end(operationsDashboardHtml);
      },
    },

    { method: "GET", pattern: "/dashboard",
      handler: async (_req, res) => {
        try { ok(res, await Gateway.getDashboard(pool)); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Connection pool status ────────────────────────────────
    { method: "GET", pattern: "/pool",
      handler: async (_req, res) => ok(res, connPool.getStatus()),
    },
  ];
}
