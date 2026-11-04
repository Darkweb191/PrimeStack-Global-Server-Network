import { IncomingMessage, ServerResponse } from "http";
import { Pool }         from "pg";
import * as Switch      from "../domain/switch.js";
import { send }         from "../../../shared/src/http-server.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

function getIp(req: IncomingMessage): string {
  const fwd = req.headers["x-gateway-client-ip"] ?? req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function handleError(res: ServerResponse, err: unknown): void {
  if (err instanceof Switch.SwitchError) {
    send(res, err.httpStatus, {
      success: false,
      responseCode: err.responseCode,
      error: { code: err.code, message: err.message },
    });
    return;
  }
  console.error("[switch-core] unhandled error:", err);
  send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

export function buildRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) =>
        send(res, 200, { success: true, data: { status: "ok", service: "switch-core" } }),
    },

    // ── Process a transaction ────────────────────────────────
    {
      method: "POST", pattern: "/transactions",
      handler: async (req, res, body) => {
        try {
          const b = body as Switch.TransactionRequest;
          if (!b?.txType || !b?.sourceAccount || !b?.destinationAccount || !b?.amount || !b?.currency)
            return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "txType, sourceAccount, destinationAccount, amount, currency required" } });

          const result = await Switch.processTransaction(pool, { ...b, ipAddress: getIp(req) });
          const status = result.approved ? 200 : 402; // 402 Payment Required for declines
          send(res, status, { success: result.approved, data: result });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── Reverse a transaction ────────────────────────────────
    {
      method: "POST", pattern: "/transactions/:txRef/reverse",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { reason: string; reversedBy?: string };
          if (!b?.reason)
            return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "reason required" } });
          const result = await Switch.reverseTransaction(pool, params.txRef, b.reason, b.reversedBy);
          send(res, result.approved ? 200 : 422, { success: result.approved, data: result });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── Get a transaction ────────────────────────────────────
    {
      method: "GET", pattern: "/transactions/:txRef",
      handler: async (_req, res, _body, params) => {
        try {
          const tx = await Switch.getTransaction(pool, params.txRef);
          send(res, 200, { success: true, data: tx });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── List transactions ────────────────────────────────────
    {
      method: "GET", pattern: "/transactions",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const result = await Switch.listTransactions(pool, {
            status:     qs.get("status")     ?? undefined,
            txType:     qs.get("txType")     ?? undefined,
            merchantId: qs.get("merchantId") ?? undefined,
            terminalId: qs.get("terminalId") ?? undefined,
            cardBin:    qs.get("cardBin")    ?? undefined,
            from:       qs.get("from") ? new Date(qs.get("from")!) : undefined,
            to:         qs.get("to")   ? new Date(qs.get("to")!)   : undefined,
            page:       parseInt(qs.get("page")     ?? "1",  10),
            pageSize:   parseInt(qs.get("pageSize") ?? "20", 10),
          });
          send(res, 200, {
            success: true,
            data:    result.data,
            meta:    { total: result.total, page: result.page, pageSize: result.pageSize },
          });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── Acquirer connections ─────────────────────────────────
    {
      method: "GET", pattern: "/acquirers",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT * FROM acquirer_connections ORDER BY code");
        send(res, 200, { success: true, data: rows.rows });
      },
    },
    {
      method: "POST", pattern: "/acquirers",
      handler: async (_req, res, body) => {
        try {
          const b = body as { code: string; name: string; host: string; port: number; protocol?: string };
          if (!b?.code || !b?.name || !b?.host || !b?.port)
            return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "code, name, host, port required" } });
          const r = await pool.query<{ id: string }>(
            `INSERT INTO acquirer_connections (code, name, host, port, protocol)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [b.code, b.name, b.host, b.port, b.protocol ?? "ISO8583"],
          );
          send(res, 201, { success: true, data: { id: r.rows[0].id } });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── Routing rules ────────────────────────────────────────
    {
      method: "GET", pattern: "/routing",
      handler: async (_req, res) => {
        const rows = await pool.query(
          `SELECT r.*, a.code as acquirer_code, a.name as acquirer_name
           FROM routing_rules r
           JOIN acquirer_connections a ON a.id = r.acquirer_id
           WHERE r.is_active = TRUE ORDER BY r.priority ASC`,
        );
        send(res, 200, { success: true, data: rows.rows });
      },
    },
    {
      method: "POST", pattern: "/routing",
      handler: async (_req, res, body) => {
        try {
          const b = body as { name: string; acquirerId: string; priority?: number; matchTxType?: string; matchCurrency?: string; matchCardBin?: string };
          if (!b?.name || !b?.acquirerId)
            return send(res, 422, { success: false, error: { code: "MISSING_FIELDS", message: "name, acquirerId required" } });
          const r = await pool.query<{ id: string }>(
            `INSERT INTO routing_rules (name, acquirer_id, priority, match_tx_type, match_currency, match_card_bin)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [b.name, b.acquirerId, b.priority ?? 100, b.matchTxType ?? null, b.matchCurrency ?? null, b.matchCardBin ?? null],
          );
          send(res, 201, { success: true, data: { id: r.rows[0].id } });
        } catch (err) { handleError(res, err); }
      },
    },

    // ── Settlement queue ─────────────────────────────────────
    {
      method: "GET", pattern: "/settlement-queue",
      handler: async (req, res) => {
        const qs     = new URL(`http://x${req.url}`).searchParams;
        const status = qs.get("status") ?? "PENDING";
        const rows   = await pool.query(
          "SELECT * FROM settlement_queue WHERE status = $1 ORDER BY created_at ASC LIMIT 200",
          [status],
        );
        send(res, 200, { success: true, data: rows.rows });
      },
    },
  ];
}
