import { Pool }             from "pg";
import { startServer, send } from "../../shared/src/http-server.js";
import * as Whitelist        from "./domain/whitelist.js";

const PORT = parseInt(process.env.PORT ?? "4002", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_ipwl",
  user:     process.env.PGUSER     ?? "ipwl_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[ipwl-db] pool error:", err.message));

const routes = [
  {
    method: "GET", pattern: "/health",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) => {
      send(res, 200, { success: true, data: { status: "ok", service: "ip-whitelist-service" } });
    },
  },
  {
    // POST /check — check if an IP is allowed (called by API Gateway)
    method: "POST", pattern: "/check",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { ip: string; clientId?: string };
        if (!b?.ip) return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "ip is required" } });
        const result = await Whitelist.checkIp(pool, b.ip, b.clientId);
        send(res, 200, { success: true, data: result });
      } catch (err) {
        console.error("[ipwl] check error:", err);
        // On error, fail OPEN (don't block traffic due to service issue)
        send(res, 200, { success: true, data: { allowed: true, matchedId: null } });
      }
    },
  },
  {
    // POST /entries — add an IP to the whitelist
    method: "POST", pattern: "/entries",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { ipRange: string; clientId?: string; label?: string; expiresAt?: string };
        if (!b?.ipRange) return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "ipRange is required" } });
        const result = await Whitelist.addEntry(pool, {
          ipRange:   b.ipRange,
          clientId:  b.clientId,
          label:     b.label,
          expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined,
        });
        send(res, 201, { success: true, data: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send(res, 400, { success: false, error: { code: "ADD_FAILED", message: msg } });
      }
    },
  },
  {
    // DELETE /entries/:id — deactivate an entry
    method: "DELETE", pattern: "/entries/:id",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], _body: unknown, params: Record<string,string>) => {
      const removed = await Whitelist.deactivateEntry(pool, params.id);
      send(res, 200, { success: true, data: { removed, id: params.id } });
    },
  },
  {
    // GET /entries — list whitelist entries
    method: "GET", pattern: "/entries",
    handler: async (req: { url?: string }, res: Parameters<typeof send>[0]) => {
      const qs = new URL(`http://x${req.url ?? "/"}`).searchParams;
      const result = await Whitelist.listEntries(pool, qs.get("clientId") ?? undefined);
      send(res, 200, { success: true, data: result.rows });
    },
  },
  {
    // POST /purge — expire old entries (call this on a cron)
    method: "POST", pattern: "/purge",
    handler: async (_req: unknown, res: Parameters<typeof send>[0]) => {
      const count = await Whitelist.purgeExpired(pool);
      send(res, 200, { success: true, data: { purged: count } });
    },
  },
];

startServer(routes as never, PORT, "ip-whitelist-service", () => pool.end());
