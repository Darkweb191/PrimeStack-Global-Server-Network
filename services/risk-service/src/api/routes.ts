import { IncomingMessage, ServerResponse } from "http";
import { Pool }       from "pg";
import { send }       from "../../../shared/src/http-server.js";
import * as RE        from "../domain/risk-engine.js";
import type { RedisClientType } from "redis";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

function ok(res: ServerResponse, data: unknown): void       { send(res, 200, { success: true, data }); }
function created(res: ServerResponse, data: unknown): void  { send(res, 201, { success: true, data }); }
function fail(res: ServerResponse, s: number, code: string, msg: string): void {
  send(res, s, { success: false, error: { code, message: msg } });
}
function err500(res: ServerResponse, err: unknown): void {
  console.error("[risk-api]", err);
  send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

export function buildRoutes(pool: Pool, redis: RedisClientType): Array<{ method: string; pattern: string; handler: Handler }> {
  return [
    // ── Health ────────────────────────────────────────────────
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) => ok(res, { status: "ok", service: "risk-service" }),
    },

    // ── Core evaluation (called by switch-core on every tx) ───
    {
      method: "POST", pattern: "/risk/evaluate",
      handler: async (req, res, body) => {
        try {
          const b = body as RE.RiskInput;
          if (!b?.txRef || !b?.sourceId || !b?.amount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "txRef, sourceId, amount, currency required");

          // Pull device fingerprint from header if not in body
          const deviceHash = b.deviceHash ?? (req.headers["x-device-fingerprint"] as string | undefined);
          const ipAddress  = b.ipAddress  ?? (req.headers["x-gateway-client-ip"] as string | undefined)
                             ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim();

          const result = await RE.evaluate(pool, redis, { ...b, deviceHash, ipAddress });
          send(res, 200, { success: true, data: result });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Score a past transaction (for dashboard / retrospective) ──
    {
      method: "GET", pattern: "/risk/score/:txRef",
      handler: async (_req, res, _b, params) => {
        try {
          const rows = await pool.query(
            "SELECT * FROM risk_decisions WHERE tx_ref = $1 ORDER BY created_at DESC LIMIT 1",
            [params.txRef],
          );
          if (!rows.rows.length) return fail(res, 404, "NOT_FOUND", `No risk decision for ${params.txRef}`);
          ok(res, rows.rows[0]);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Blacklist ─────────────────────────────────────────────
    {
      method: "GET", pattern: "/risk/blacklist",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const result = await RE.listBlacklist(
            pool,
            qs.get("type")     ?? undefined,
            parseInt(qs.get("page")     ?? "1", 10),
            parseInt(qs.get("pageSize") ?? "50", 10),
          );
          send(res, 200, { success: true, data: result.data, meta: { total: result.total } });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/risk/blacklist",
      handler: async (_req, res, body) => {
        try {
          const b = body as { blacklistType: string; value: string; reason?: string; source?: string; addedBy?: string; expiresAt?: string };
          if (!b?.blacklistType || !b?.value)
            return fail(res, 422, "MISSING_FIELDS", "blacklistType, value required");
          const result = await RE.addToBlacklist(pool, { ...b, expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined });
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "DELETE", pattern: "/risk/blacklist/:type/:value",
      handler: async (_req, res, _b, params) => {
        try {
          const removed = await RE.removeFromBlacklist(pool, params.type, decodeURIComponent(params.value));
          ok(res, { removed, type: params.type, value: params.value });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Watchlist ─────────────────────────────────────────────
    {
      method: "POST", pattern: "/risk/watchlist",
      handler: async (_req, res, body) => {
        try {
          const b = body as { entityType: string; entityValue: string; score: number; reason?: string; expiresAt?: string };
          if (!b?.entityType || !b?.entityValue || b?.score === undefined)
            return fail(res, 422, "MISSING_FIELDS", "entityType, entityValue, score required");
          const result = await RE.addToWatchlist(pool, { ...b, expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined });
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Risk Profiles ─────────────────────────────────────────
    {
      method: "POST", pattern: "/risk/profiles",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof RE.upsertProfile>[1];
          if (!b?.merchantId)
            return fail(res, 422, "MISSING_FIELDS", "merchantId required");
          await RE.upsertProfile(pool, b);
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "GET", pattern: "/risk/profiles/:merchantId",
      handler: async (_req, res, _b, params) => {
        try {
          const rows = await pool.query("SELECT * FROM risk_profiles WHERE merchant_id = $1", [params.merchantId]);
          if (!rows.rows.length) return fail(res, 404, "NOT_FOUND", "Profile not found");
          ok(res, rows.rows[0]);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Manual Review Queue ───────────────────────────────────
    {
      method: "GET", pattern: "/risk/review",
      handler: async (req, res) => {
        try {
          const qs     = new URL(`http://x${req.url}`).searchParams;
          const result = await RE.listReviewQueue(
            pool,
            qs.get("status")   ?? "OPEN",
            parseInt(qs.get("page")     ?? "1", 10),
            parseInt(qs.get("pageSize") ?? "50", 10),
          );
          send(res, 200, { success: true, data: result.data, meta: { total: result.total } });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/risk/review/:id/approve",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { approvedBy: string; notes?: string };
          if (!b?.approvedBy) return fail(res, 422, "MISSING_FIELDS", "approvedBy required");
          await RE.approveReview(pool, params.id, b.approvedBy, b.notes);
          ok(res, { approved: true });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/risk/review/:id/reject",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { rejectedBy: string; notes?: string };
          if (!b?.rejectedBy) return fail(res, 422, "MISSING_FIELDS", "rejectedBy required");
          await RE.rejectReview(pool, params.id, b.rejectedBy, b.notes);
          ok(res, { rejected: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── AML Cases ─────────────────────────────────────────────
    {
      method: "GET", pattern: "/risk/aml",
      handler: async (req, res) => {
        try {
          const qs     = new URL(`http://x${req.url}`).searchParams;
          const result = await RE.listAmlCases(pool, qs.get("status") ?? undefined, parseInt(qs.get("page") ?? "1", 10), 50);
          send(res, 200, { success: true, data: result.data, meta: { total: result.total } });
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "POST", pattern: "/risk/aml",
      handler: async (_req, res, body) => {
        try {
          const result = await RE.openAmlCase(pool, body as Parameters<typeof RE.openAmlCase>[1]);
          created(res, result);
        } catch (e) { err500(res, e); }
      },
    },
    {
      method: "PATCH", pattern: "/risk/aml/:id",
      handler: async (_req, res, body, params) => {
        try {
          await RE.updateAmlCase(pool, params.id, body as Parameters<typeof RE.updateAmlCase>[2]);
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Country Rules ─────────────────────────────────────────
    {
      method: "GET", pattern: "/risk/countries",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT * FROM country_rules ORDER BY country_code");
        ok(res, rows.rows);
      },
    },
    {
      method: "PUT", pattern: "/risk/countries/:code",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { allowed?: boolean; riskScore?: number; notes?: string };
          await pool.query(
            `INSERT INTO country_rules (country_code, allowed, risk_score, notes) VALUES ($1,$2,$3,$4)
             ON CONFLICT (country_code) DO UPDATE SET
               allowed = COALESCE(EXCLUDED.allowed, country_rules.allowed),
               risk_score = COALESCE(EXCLUDED.risk_score, country_rules.risk_score),
               notes = COALESCE(EXCLUDED.notes, country_rules.notes), updated_at = NOW()`,
            [params.code.toUpperCase(), b.allowed ?? null, b.riskScore ?? null, b.notes ?? null],
          );
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    // ── Dashboard ─────────────────────────────────────────────
    {
      method: "GET", pattern: "/risk/dashboard",
      handler: async (_req, res) => {
        try {
          const stats = await RE.getDashboardStats(pool);
          ok(res, stats);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Decision history ──────────────────────────────────────
    {
      method: "GET", pattern: "/risk/decisions",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const page = parseInt(qs.get("page") ?? "1", 10);
          const size = parseInt(qs.get("pageSize") ?? "50", 10);
          const offset = (page - 1) * size;

          const where: string[] = [];
          const params: unknown[] = [];
          if (qs.get("decision"))   { params.push(qs.get("decision"));   where.push(`decision = $${params.length}`); }
          if (qs.get("merchantId")) { params.push(qs.get("merchantId")); where.push(`merchant_id = $${params.length}`); }

          const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
          const [rows, count] = await Promise.all([
            pool.query(`SELECT * FROM risk_decisions ${clause} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, size, offset]),
            pool.query(`SELECT COUNT(*) FROM risk_decisions ${clause}`, params),
          ]);
          send(res, 200, { success: true, data: rows.rows, meta: { total: parseInt(count.rows[0].count, 10) } });
        } catch (e) { err500(res, e); }
      },
    },
  ];
}
