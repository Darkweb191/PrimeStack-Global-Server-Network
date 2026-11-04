import { Pool }             from "pg";
import { startServer, send } from "../../shared/src/http-server.js";
import * as Security         from "./domain/security.js";

const PORT = parseInt(process.env.PORT ?? "4011", 10);

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  database: process.env.PGDATABASE ?? "primestack_security",
  user:     process.env.PGUSER     ?? "security_svc",
  password: process.env.PGPASSWORD,
  ssl:      process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false,
  max:      20,
  idleTimeoutMillis:        30_000,
  connectionTimeoutMillis:   5_000,
});

pool.on("error", (err) => console.error("[security-db] pool error:", err.message));

function handleError(res: Parameters<typeof send>[0], err: unknown): void {
  if (err instanceof Security.SecurityError) {
    send(res, err.httpStatus, { success: false, error: { code: err.code, message: err.message } });
    return;
  }
  console.error("[security-api] error:", err);
  send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

const routes = [
  {
    method: "GET", pattern: "/health",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) =>
      send(res, 200, { success: true, data: { status: "ok", service: "security-service" } }),
  },

  // ── HMAC Verification (called by API Gateway) ────────────
  {
    method: "POST", pattern: "/hmac/verify",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { clientId: string; timestamp: string; signature: string; method: string; path: string; rawBody?: string; fromIp?: string };
        if (!b?.clientId || !b?.timestamp || !b?.signature || !b?.method || !b?.path)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "clientId, timestamp, signature, method, path required" } });

        const result = await Security.verifyHmacSignature(pool, b.clientId, b.timestamp, b.signature, b.method, b.path, b.rawBody ?? "", b.fromIp);
        send(res, result.valid ? 200 : 401, { success: result.valid, data: result });
      } catch (err) { handleError(res, err); }
    },
  },

  // ── API Key Verification ──────────────────────────────────
  {
    method: "POST", pattern: "/api-keys/verify",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { keyId: string; secret: string; fromIp?: string };
        if (!b?.keyId || !b?.secret)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "keyId, secret required" } });

        const result = await Security.verifyApiKey(pool, b.keyId, b.secret, b.fromIp);
        send(res, result.valid ? 200 : 401, { success: result.valid, data: result });
      } catch (err) { handleError(res, err); }
    },
  },

  // ── HMAC Key Management ───────────────────────────────────
  {
    method: "POST", pattern: "/hmac/keys",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Parameters<typeof Security.createHmacKey>[1];
        const result = await Security.createHmacKey(pool, b ?? {});
        send(res, 201, { success: true, data: result }); // secret shown ONCE
      } catch (err) { handleError(res, err); }
    },
  },
  {
    method: "POST", pattern: "/hmac/keys/:clientId/rotate",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown, params: Record<string,string>) => {
      try {
        const b = body as { gracePeriodMs?: number; rotatedBy?: string };
        const result = await Security.rotateHmacKey(pool, params.clientId, b?.gracePeriodMs, b?.rotatedBy);
        send(res, 200, { success: true, data: result });
      } catch (err) { handleError(res, err); }
    },
  },

  // ── API Key Management ────────────────────────────────────
  {
    method: "POST", pattern: "/api-keys",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Parameters<typeof Security.createApiKey>[1];
        if (!b?.scopes?.length)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "scopes array required" } });
        const result = await Security.createApiKey(pool, b);
        send(res, 201, { success: true, data: result }); // secret shown ONCE
      } catch (err) { handleError(res, err); }
    },
  },
  {
    method: "DELETE", pattern: "/api-keys/:keyId",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], _b: unknown, params: Record<string,string>) => {
      await pool.query("UPDATE api_keys SET status = 'REVOKED', updated_at = NOW() WHERE key_id = $1", [params.keyId]);
      send(res, 200, { success: true, data: { revoked: true } });
    },
  },

  // ── User Auth ─────────────────────────────────────────────
  {
    method: "POST", pattern: "/users/login",
    handler: async (req: { headers?: Record<string,unknown> }, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as { email: string; password: string };
        if (!b?.email || !b?.password)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "email, password required" } });

        const ip = (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0] ?? undefined;
        const result = await Security.authenticateUser(pool, b.email, b.password, ip);
        send(res, 200, { success: true, data: result });
      } catch (err) { handleError(res, err); }
    },
  },
  {
    method: "POST", pattern: "/users",
    handler: async (_req: unknown, res: Parameters<typeof send>[0], body: unknown) => {
      try {
        const b = body as Parameters<typeof Security.createUser>[1];
        if (!b?.email || !b?.password || !b?.fullName || !b?.roleName || !b?.username)
          return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "email, username, password, fullName, roleName required" } });
        const result = await Security.createUser(pool, b);
        send(res, 201, { success: true, data: result });
      } catch (err) { handleError(res, err); }
    },
  },

  // ── Permissions ───────────────────────────────────────────
  {
    method: "GET", pattern: "/roles",
    handler: async (_r: unknown, res: Parameters<typeof send>[0]) => {
      const rows = await pool.query("SELECT id, name, description, is_system FROM roles ORDER BY name");
      send(res, 200, { success: true, data: rows.rows });
    },
  },

  // ── Certificates ──────────────────────────────────────────
  {
    method: "GET", pattern: "/certificates/expiring",
    handler: async (req: { url?: string }, res: Parameters<typeof send>[0]) => {
      const qs   = new URL(`http://x${req.url ?? "/"}`).searchParams;
      const days = parseInt(qs.get("days") ?? "30", 10);
      const rows = await Security.getExpiringCertificates(pool, days);
      send(res, 200, { success: true, data: rows.rows });
    },
  },

  // ── Security Events ───────────────────────────────────────
  {
    method: "GET", pattern: "/events",
    handler: async (req: { url?: string }, res: Parameters<typeof send>[0]) => {
      const qs      = new URL(`http://x${req.url ?? "/"}`).searchParams;
      const severity = qs.get("severity");
      const where    = severity ? "WHERE severity = $1" : "";
      const params   = severity ? [severity] : [];
      const rows     = await pool.query(
        `SELECT * FROM security_events ${where} ORDER BY occurred_at DESC LIMIT 200`,
        params,
      );
      send(res, 200, { success: true, data: rows.rows });
    },
  },
];

startServer(routes as never, PORT, "security-service", () => pool.end());
