import { IncomingMessage, ServerResponse } from "http";
import { Pool }  from "pg";
import * as TMS  from "../domain/tms.js";
import { terminalDashboardHtml } from "../ui/dashboard.js";
import { send }  from "../../../shared/src/http-server.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

const ok      = (r: ServerResponse, d: unknown) => send(r, 200, { success: true, data: d });
const created = (r: ServerResponse, d: unknown) => send(r, 201, { success: true, data: d });
const fail    = (r: ServerResponse, s: number, c: string, m: string) =>
  send(r, s, { success: false, error: { code: c, message: m } });
const err500  = (r: ServerResponse, e: unknown) => {
  if (e instanceof TMS.TmsError) { fail(r, e.httpStatus, e.code, e.message); return; }
  console.error("[tms-api]", e);
  send(r, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};

export function buildTmsRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [

    { method: "GET", pattern: "/dashboard",
      handler: async (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(terminalDashboardHtml),
          "Cache-Control": "no-store",
        });
        res.end(terminalDashboardHtml);
      },
    },

    { method: "GET", pattern: "/commands/recent",
      handler: async (_req, res) => {
        try {
          const rows = await pool.query(
            `SELECT c.id, t.tid, c.command, c.status, c.created_at, c.sent_at, c.acked_at
             FROM terminal_commands c
             JOIN terminals t ON t.id = c.terminal_id
             ORDER BY c.created_at DESC LIMIT 20`,
          );
          ok(res, rows.rows);
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/events/recent",
      handler: async (_req, res) => {
        try {
          const rows = await pool.query(
            `SELECT a.id, t.tid, a.activity_type, a.description, a.performed_by, a.created_at
             FROM terminal_activity a
             JOIN terminals t ON t.id = a.terminal_id
             ORDER BY a.created_at DESC LIMIT 50`,
          );
          ok(res, rows.rows);
        } catch (e) { err500(res, e); }
      },
    },

    // ── Terminal Groups ───────────────────────────────────────

    { method: "POST", pattern: "/groups",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.createGroup>[1];
          if (!b?.groupName || !b?.groupType) return fail(res, 422, "MISSING_FIELDS", "groupName, groupType required");
          created(res, await TMS.createGroup(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/groups",
      handler: async (_req, res) => {
        try { ok(res, (await TMS.listGroups(pool)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/groups/:id/members",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { terminalId: string };
          if (!b?.terminalId) return fail(res, 422, "MISSING_FIELDS", "terminalId required");
          await TMS.addTerminalToGroup(pool, params.id, b.terminalId);
          ok(res, { added: true });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/groups/:id/terminals",
      handler: async (_req, res, _b, params) => {
        try { ok(res, (await TMS.getGroupTerminals(pool, params.id)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Parameter Distribution ────────────────────────────────

    { method: "POST", pattern: "/parameters/push",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.pushParameter>[1];
          if (!b?.terminalId || !b?.paramKey || !b?.paramValue)
            return fail(res, 422, "MISSING_FIELDS", "terminalId, paramKey, paramValue required");
          created(res, await TMS.pushParameter(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/parameters/push-group",
      handler: async (_req, res, body) => {
        try {
          const b = body as { groupId: string; paramKey: string; paramValue: string; paramType?: string; updatedBy?: string };
          if (!b?.groupId || !b?.paramKey || !b?.paramValue)
            return fail(res, 422, "MISSING_FIELDS", "groupId, paramKey, paramValue required");
          const count = await TMS.pushParameterToGroup(pool, b.groupId, b.paramKey, b.paramValue, b.paramType ?? "STRING", b.updatedBy);
          ok(res, { pushed: count });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/parameters/pending/:terminalId",
      handler: async (_req, res, _b, params) => {
        try { ok(res, (await TMS.getPendingParameters(pool, params.terminalId)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/parameters/:id/confirm",
      handler: async (_req, res, _b, params) => {
        try { await TMS.confirmParameter(pool, params.id); ok(res, { confirmed: true }); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Application Management ────────────────────────────────

    { method: "POST", pattern: "/applications",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.registerApplication>[1];
          if (!b?.appName || !b?.currentVersion) return fail(res, 422, "MISSING_FIELDS", "appName, currentVersion required");
          created(res, await TMS.registerApplication(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/applications",
      handler: async (_req, res) => {
        ok(res, (await pool.query("SELECT * FROM applications ORDER BY app_name")).rows);
      },
    },

    { method: "POST", pattern: "/applications/:appId/terminal/:terminalId",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { version: string };
          if (!b?.version) return fail(res, 422, "MISSING_FIELDS", "version required");
          await TMS.setTerminalAppVersion(pool, params.terminalId, params.appId, b.version);
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/applications/:appId/outdated",
      handler: async (_req, res, _b, params) => {
        try { ok(res, (await TMS.getOutdatedTerminals(pool, params.appId)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Key Lifecycle ──────────────────────────────────────────

    { method: "POST", pattern: "/keys/inject",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.recordKeyInjection>[1];
          if (!b?.terminalId || !b?.keyType || !b?.keyReference)
            return fail(res, 422, "MISSING_FIELDS", "terminalId, keyType, keyReference required");
          created(res, await TMS.recordKeyInjection(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/keys/rotate",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.rotateKey>[1];
          if (!b?.terminalId || !b?.keyType || !b?.newKeyRef)
            return fail(res, 422, "MISSING_FIELDS", "terminalId, keyType, newKeyRef required");
          created(res, await TMS.rotateKey(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/keys/expiring",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const days = parseInt(qs.get("days") ?? "30", 10);
          ok(res, (await TMS.getExpiringKeys(pool, days)).rows);
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/keys/:terminalId/history",
      handler: async (_req, res, _b, params) => {
        try { ok(res, (await TMS.getKeyHistory(pool, params.terminalId)).rows); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Firmware Deployment ───────────────────────────────────

    { method: "POST", pattern: "/firmware/deploy",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof TMS.deployFirmware>[1];
          if (!b?.firmwareVersionId || !b?.terminalId)
            return fail(res, 422, "MISSING_FIELDS", "firmwareVersionId, terminalId required");
          created(res, await TMS.deployFirmware(pool, b));
        } catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/firmware/:id/status",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { status: string; progress?: number; error?: string };
          if (!b?.status) return fail(res, 422, "MISSING_FIELDS", "status required");
          await TMS.updateDeploymentStatus(pool, params.id, b.status, b.progress, b.error);
          ok(res, { updated: true });
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/firmware/pending",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          ok(res, (await TMS.getPendingDeployments(pool, qs.get("terminalId") ?? undefined)).rows);
        } catch (e) { err500(res, e); }
      },
    },

    { method: "POST", pattern: "/firmware/:id/rollback",
      handler: async (_req, res, _b, params) => {
        try { await TMS.rollbackFirmware(pool, params.id); ok(res, { rolledBack: true }); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Device Analytics ──────────────────────────────────────

    { method: "GET", pattern: "/analytics/:terminalId",
      handler: async (req, res, _b, params) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const days = parseInt(qs.get("days") ?? "30", 10);
          ok(res, (await TMS.getAnalytics(pool, params.terminalId, days)).rows);
        } catch (e) { err500(res, e); }
      },
    },

    { method: "GET", pattern: "/fleet/overview",
      handler: async (_req, res) => {
        try { ok(res, (await TMS.getFleetOverview(pool)).rows[0]); }
        catch (e) { err500(res, e); }
      },
    },

    // ── Activity Log ───────────────────────────────────────────

    { method: "GET", pattern: "/activity/:terminalId",
      handler: async (req, res, _b, params) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const limit = parseInt(qs.get("limit") ?? "100", 10);
          ok(res, (await TMS.getActivityLog(pool, params.terminalId, limit)).rows);
        } catch (e) { err500(res, e); }
      },
    },
  ];
}
