import { IncomingMessage, ServerResponse } from "http";
import { Pool }            from "pg";
import * as Orchestrator   from "../domain/orchestrator.js";
import * as Transfer       from "../domain/transfer.js";
import { send }            from "../../../shared/src/http-server.js";

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
function getIp(req: IncomingMessage): string {
  const fwd = req.headers["x-gateway-client-ip"] ?? req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}
function handleError(res: ServerResponse, err: unknown): void {
  if (err instanceof Orchestrator.OrchestratorError) {
    fail(res, err.httpStatus, err.code, err.message);
    return;
  }
  if (err instanceof Transfer.TransferError) {
    fail(res, err.httpStatus, err.code, err.message);
    return;
  }
  console.error("[transfer-api] error:", err);
  fail(res, 500, "INTERNAL_ERROR", "Internal server error");
}

export function buildRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) => { ok(res, { status: "ok", service: "transfer-service" }); },
    },
    {
      // POST /transfers — initiate and execute a transfer
      method: "POST", pattern: "/transfers",
      handler: async (req, res, body) => {
        try {
          const b = body as Transfer.CreateTransferInput;
          if (!b?.transferRef || !b?.type || !b?.sourceType || !b?.sourceId || !b?.destType || !b?.destId || !b?.amount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "transferRef, type, sourceType, sourceId, destType, destId, amount, currency required");

          const result = await Orchestrator.execute(pool, b, getIp(req));
          const status = result.status === "COMPLETED" ? 201 : 202; // 202 = RISK_HOLD
          send(res, status, { success: true, data: result });
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // GET /transfers/:ref — get a transfer by reference
      method: "GET", pattern: "/transfers/:ref",
      handler: async (_req, res, _body, params) => {
        try {
          const rows = await pool.query("SELECT * FROM transfers WHERE transfer_ref = $1", [params.ref]);
          if (rows.rows.length === 0) return fail(res, 404, "NOT_FOUND", `Transfer not found: ${params.ref}`);
          ok(res, rows.rows[0]);
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // GET /transfers — list transfers with filters
      method: "GET", pattern: "/transfers",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const result = await Transfer.list(pool, {
            status:   qs.get("status")   ?? undefined,
            type:     qs.get("type")     ?? undefined,
            sourceId: qs.get("sourceId") ?? undefined,
            destId:   qs.get("destId")   ?? undefined,
            page:     parseInt(qs.get("page")     ?? "1",  10),
            pageSize: parseInt(qs.get("pageSize") ?? "20", 10),
          });
          send(res, 200, {
            success: true,
            data:    result.data,
            meta:    { total: result.total, page: parseInt(qs.get("page") ?? "1", 10), pageSize: parseInt(qs.get("pageSize") ?? "20", 10) },
          });
        } catch (err) { handleError(res, err); }
      },
    },
    {
      // POST /transfers/:ref/reverse
      method: "POST", pattern: "/transfers/:ref/reverse",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { reason: string; reversedBy?: string };
          if (!b?.reason) return fail(res, 422, "MISSING_FIELDS", "reason is required");
          const result = await Orchestrator.reverseTransfer(pool, params.ref, b.reason, b.reversedBy);
          ok(res, result);
        } catch (err) { handleError(res, err); }
      },
    },
  ];
}

// Re-export CreateTransferInput so server can import it
export type { CreateTransferInput } from "../domain/transfer.js";
