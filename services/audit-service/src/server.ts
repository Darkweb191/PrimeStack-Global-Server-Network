import { Pool }             from "pg";
import { startServer, send } from "../../shared/src/http-server.js";
import * as Audit            from "./domain/audit.js";

const PORT = parseInt(process.env.PORT ?? "4007", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_audit",
  user:     process.env.PGUSER     ?? "audit_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[audit-db] pool error:", err.message));

const routes = [
  {
    method: "GET", pattern: "/health",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) => {
      send(res, 200, { success: true, data: { status: "ok", service: "audit-service" } });
    },
  },
  {
    // POST /events — record an audit event
    method: "POST", pattern: "/events",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Audit.AuditEventInput;
        if (!b?.actorType || !b?.eventType || !b?.description)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "actorType, eventType, description required" } });
        await Audit.record(pool, b);
        send(res, 201, { success: true, data: { recorded: true } });
      } catch (err) {
        // Audit failures must NEVER crash the caller — silently log and continue
        console.error("[audit] record failed:", err);
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Audit write failed" } });
      }
    },
  },
  {
    // GET /events — query audit events
    method: "GET", pattern: "/events",
    handler: async (req: { url?: string }, res: Parameters<typeof send>[0]) => {
      try {
        const qs = new URL(`http://x${req.url ?? "/"}`).searchParams;
        const result = await Audit.query(pool, {
          actorId:      qs.get("actorId")      ?? undefined,
          eventType:    qs.get("eventType")    ?? undefined,
          resourceType: qs.get("resourceType") ?? undefined,
          resourceId:   qs.get("resourceId")   ?? undefined,
          severity:     qs.get("severity")     as Audit.AuditSeverity ?? undefined,
          from:         qs.get("from") ? new Date(qs.get("from")!) : undefined,
          to:           qs.get("to")   ? new Date(qs.get("to")!)   : undefined,
          page:     parseInt(qs.get("page")     ?? "1",  10),
          pageSize: parseInt(qs.get("pageSize") ?? "50", 10),
        });
        send(res, 200, { success: true, data: result.data, meta: { total: result.total, page: result.page, pageSize: result.pageSize } });
      } catch (err) {
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
      }
    },
  },
  {
    // GET /alerts — recent WARN/ERROR/CRITICAL events
    method: "GET", pattern: "/alerts",
    handler: async (_req: unknown, res: Parameters<typeof send>[0]) => {
      const result = await Audit.getAlerts(pool);
      send(res, 200, { success: true, data: result.rows });
    },
  },
];

startServer(routes as never, PORT, "audit-service", () => pool.end());
