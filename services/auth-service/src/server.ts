import { Pool }             from "pg";
import { startServer, send } from "../../shared/src/http-server.js";
import * as Hmac             from "./domain/hmac.js";

const PORT = parseInt(process.env.PORT ?? "4003", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_auth",
  user:     process.env.PGUSER     ?? "auth_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[auth-db] pool error:", err.message));

const routes = [
  {
    method: "GET", pattern: "/health",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) => {
      send(res, 200, { success: true, data: { status: "ok", service: "auth-service" } });
    },
  },
  {
    // POST /verify — verify an HMAC signature (called by API Gateway)
    method: "POST", pattern: "/verify",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as {
          clientId:  string;
          timestamp: string;
          signature: string;
          method:    string;
          path:      string;
          rawBody?:  string;
        };

        if (!b?.clientId || !b?.timestamp || !b?.signature || !b?.method || !b?.path) {
          send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "clientId, timestamp, signature, method, path required" } });
          return;
        }

        const result = await Hmac.verifyHmac(pool, {
          clientId:  b.clientId,
          timestamp: b.timestamp,
          signature: b.signature,
          method:    b.method,
          path:      b.path,
          rawBody:   b.rawBody ?? "",
        });

        // Log auth attempt (fire and forget)
        pool.query(
          `INSERT INTO auth_events (event_type, client_id, success, failure_reason)
           VALUES ('HMAC_VERIFY', $1, $2, $3)`,
          [b.clientId, result.ok, result.ok ? null : (result as { reason?: string }).reason ?? null],
        ).catch(() => { /* non-critical */ });

        send(res, result.ok ? 200 : 401, { success: result.ok, data: result });
      } catch (err) {
        console.error("[auth-api] verify error:", err);
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
      }
    },
  },
  {
    // POST /keys — create an HMAC key pair (admin only)
    method: "POST", pattern: "/keys",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { merchantId?: string; label?: string; expiresAt?: string };
        const result = await Hmac.createHmacKey(pool, {
          merchantId: b?.merchantId,
          label:      b?.label,
          expiresAt:  b?.expiresAt ? new Date(b.expiresAt) : undefined,
        });
        // Secret returned exactly once — the caller must store it securely
        send(res, 201, { success: true, data: result });
      } catch (err) {
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
      }
    },
  },
  {
    // POST /keys/:clientId/rotate
    method: "POST", pattern: "/keys/:clientId/rotate",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], _body: unknown, params: Record<string,string>) => {
      try {
        const result = await Hmac.rotateHmacKey(pool, params.clientId);
        send(res, 200, { success: true, data: result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send(res, 400, { success: false, error: { code: "ROTATION_FAILED", message: msg } });
      }
    },
  },
  {
    // POST /sign — generate a signature for outbound requests (used internally)
    method: "POST", pattern: "/sign",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { secret: string; method: string; path: string; timestamp: string; rawBody?: string };
        if (!b?.secret || !b?.method || !b?.path || !b?.timestamp)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "secret, method, path, timestamp required" } });
        const signature = Hmac.signRequest(b.secret, b.method, b.path, b.timestamp, b.rawBody);
        send(res, 200, { success: true, data: { signature } });
      } catch (err) {
        send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
      }
    },
  },
];

startServer(routes as never, PORT, "auth-service", () => pool.end());
