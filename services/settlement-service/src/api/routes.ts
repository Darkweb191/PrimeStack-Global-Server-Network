import { IncomingMessage, ServerResponse } from "http";
import { Pool }             from "pg";
import * as Settlement      from "../domain/settlement.js";
import * as Recon           from "../domain/reconciliation.js";
import * as Engine          from "../domain/settlement-engine.js";
import { send }             from "../../../shared/src/http-server.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, params: Record<string,string>) => Promise<void>;

const ok      = (r: ServerResponse, d: unknown) => send(r, 200, { success: true, data: d });
const created = (r: ServerResponse, d: unknown) => send(r, 201, { success: true, data: d });
const fail    = (r: ServerResponse, s: number, c: string, m: string) =>
  send(r, s, { success: false, error: { code: c, message: m } });

function handleError(res: ServerResponse, err: unknown): void {
  const e = err as { httpStatus?: number; code?: string; message: string };
  if (e.code && e.httpStatus) { fail(res, e.httpStatus, e.code, e.message); return; }
  console.error("[settlement]", err);
  send(res, 500, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

export function buildRoutes(pool: Pool): Array<{ method: string; pattern: string; handler: Handler }> {
  return [

    // ── Health ────────────────────────────────────────────────
    {
      method: "GET", pattern: "/health",
      handler: async (_req, res) => ok(res, { status: "ok", service: "settlement-service" }),
    },

    // ══════════════════════════════════════════════════════════
    // SETTLEMENT ACCOUNTS
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/accounts",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Engine.createSettlementAccount>[1];
          if (!b?.participantCode || !b?.participantType || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "participantCode, participantType, currency required");
          created(res, await Engine.createSettlementAccount(pool, b));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/accounts",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          ok(res, (await Engine.listSettlementAccounts(pool, qs.get("type") ?? undefined)).rows);
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/accounts/:code",
      handler: async (_req, res, _b, params) => {
        try { ok(res, await Engine.getSettlementAccount(pool, params.code)); }
        catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // SETTLEMENT QUEUE
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/queue",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Engine.enqueue>[1];
          if (!b?.reference || !b?.sourceCode || !b?.destCode || !b?.amount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "reference, sourceCode, destCode, amount, currency required");
          await Engine.enqueue(pool, b);
          ok(res, { queued: true, reference: b.reference });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/queue",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const date = qs.get("date") ?? undefined;
          const stats = await Engine.getQueueStats(pool, date);
          ok(res, stats.rows);
        } catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // NET POSITIONS & NET SETTLEMENT
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/net/calculate",
      handler: async (_req, res, body) => {
        try {
          const b    = body as { businessDate: string };
          if (!b?.businessDate) return fail(res, 422, "MISSING_FIELDS", "businessDate required");
          const result = await Engine.calculateNetPositions(pool, b.businessDate);
          ok(res, result);
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/net/settle",
      handler: async (_req, res, body) => {
        try {
          const b = body as { businessDate: string };
          if (!b?.businessDate) return fail(res, 422, "MISSING_FIELDS", "businessDate required");
          ok(res, await Engine.processNetSettlement(pool, b.businessDate));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/net/positions",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const date = qs.get("date") ?? new Date().toISOString().split("T")[0];
          const rows = await pool.query(
            `SELECT np.*, sa.participant_type FROM net_positions np
             JOIN settlement_accounts sa ON sa.id = np.participant_id
             WHERE np.business_date = $1 ORDER BY ABS(np.net_amount) DESC`,
            [date],
          );
          ok(res, rows.rows);
        } catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // SETTLEMENT BATCHES (legacy batch-per-merchant)
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/batches",
      handler: async (_req, res, body) => {
        try {
          const b = body as { merchantId: string; merchantCode: string; periodStart: string; periodEnd: string; currency?: string };
          if (!b?.merchantId || !b?.merchantCode || !b?.periodStart || !b?.periodEnd)
            return fail(res, 422, "MISSING_FIELDS", "merchantId, merchantCode, periodStart, periodEnd required");
          created(res, await Settlement.openBatch(pool, { merchantId: b.merchantId, merchantCode: b.merchantCode, periodStart: new Date(b.periodStart), periodEnd: new Date(b.periodEnd), currency: b.currency ?? "USD" }));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/batches",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Settlement.listBatches(pool, { merchantId: qs.get("merchantId") ?? undefined, status: qs.get("status") ?? undefined, currency: qs.get("currency") ?? undefined, page: parseInt(qs.get("page") ?? "1", 10), pageSize: parseInt(qs.get("pageSize") ?? "20", 10) });
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/batches/:id",
      handler: async (_req, res, _b, params) => {
        try { ok(res, await Settlement.getBatch(pool, params.id)); }
        catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/batches/:id/items",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { transferRef: string; amount: string; feeAmount?: string; currency: string; itemType?: "TRANSFER" | "CHARGEBACK" | "REVERSAL" | "FEE" | "ADJUSTMENT" };
          if (!b?.transferRef || !b?.amount || !b?.currency) return fail(res, 422, "MISSING_FIELDS", "transferRef, amount, currency required");
          await Settlement.addTransferToBatch(pool, params.id, b.transferRef, b.amount, b.feeAmount ?? "0", b.currency, b.itemType);
          ok(res, { added: true });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/batches/:id/process",
      handler: async (_req, res, _b, params) => {
        try { ok(res, await Settlement.processBatch(pool, params.id)); }
        catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // REVERSALS
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/reversals",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Engine.initiateReversal>[1];
          if (!b?.originalTx || !b?.originalAmount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "originalTx, originalAmount, currency required");
          created(res, await Engine.initiateReversal(pool, b));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/reversals",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Engine.listReversals(pool, qs.get("status") ?? undefined, parseInt(qs.get("page") ?? "1", 10), 50);
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/reversals/:id/complete",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { journalEntryRef: string; approvedBy?: string };
          if (!b?.journalEntryRef) return fail(res, 422, "MISSING_FIELDS", "journalEntryRef required");
          await Engine.completeReversal(pool, params.id, b.journalEntryRef, b.approvedBy);
          ok(res, { completed: true });
        } catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // CHARGEBACKS
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/chargebacks",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Engine.fileChargeback>[1];
          if (!b?.transactionRef || !b?.merchantId || !b?.amount || !b?.currency)
            return fail(res, 422, "MISSING_FIELDS", "transactionRef, merchantId, amount, currency required");
          created(res, await Engine.fileChargeback(pool, b));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/chargebacks",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Engine.listChargebacks(pool, qs.get("status") ?? undefined, qs.get("merchantId") ?? undefined, parseInt(qs.get("page") ?? "1", 10), 50);
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "PATCH", pattern: "/chargebacks/:caseNumber",
      handler: async (_req, res, body, params) => {
        try {
          await Engine.updateChargeback(pool, params.caseNumber, body as Parameters<typeof Engine.updateChargeback>[2]);
          ok(res, { updated: true });
        } catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // RECONCILIATION
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/reconciliation/run",
      handler: async (_req, res, body) => {
        try {
          const b = body as { businessDate: string; records: Array<{ reference: string; amount: string; currency: string; participantCode?: string; source: string }> };
          if (!b?.businessDate || !b?.records?.length)
            return fail(res, 422, "MISSING_FIELDS", "businessDate, records required");
          ok(res, await Engine.runReconciliation(pool, b.businessDate, b.records));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/reconciliation/exceptions",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Engine.listExceptions(pool, qs.get("status") ?? "OPEN", parseInt(qs.get("page") ?? "1", 10), 50);
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/reconciliation/exceptions/:id/resolve",
      handler: async (_req, res, body, params) => {
        try {
          const b = body as { resolution: string; resolvedBy: string };
          if (!b?.resolution || !b?.resolvedBy) return fail(res, 422, "MISSING_FIELDS", "resolution, resolvedBy required");
          await Engine.resolveException(pool, params.id, b.resolution, b.resolvedBy);
          ok(res, { resolved: true });
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/reconciliation/mismatches",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          const r  = await Recon.listMismatches(pool, parseInt(qs.get("page") ?? "1", 10), 50);
          send(res, 200, { success: true, data: r.data, meta: { total: r.total } });
        } catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // EOD PROCESSING
    // ══════════════════════════════════════════════════════════

    {
      method: "POST", pattern: "/eod/run",
      handler: async (_req, res, body) => {
        try {
          const b = body as { businessDate: string; runBy?: string };
          if (!b?.businessDate) return fail(res, 422, "MISSING_FIELDS", "businessDate required");
          ok(res, await Engine.runEod(pool, b.businessDate, b.runBy));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/eod/summary",
      handler: async (req, res) => {
        try {
          const qs = new URL(`http://x${req.url}`).searchParams;
          ok(res, await Recon.getEodSummary(pool, qs.get("date") ? new Date(qs.get("date")!) : undefined));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/eod/runs",
      handler: async (_req, res) => {
        const rows = await pool.query("SELECT * FROM eod_runs ORDER BY business_date DESC LIMIT 30");
        ok(res, rows.rows);
      },
    },

    // ══════════════════════════════════════════════════════════
    // TREASURY DASHBOARD
    // ══════════════════════════════════════════════════════════

    {
      method: "GET", pattern: "/treasury/dashboard",
      handler: async (_req, res) => {
        try { ok(res, await Engine.getTreasuryDashboard(pool)); }
        catch (e) { handleError(res, e); }
      },
    },

    // ══════════════════════════════════════════════════════════
    // REPORTS
    // ══════════════════════════════════════════════════════════

    {
      method: "GET", pattern: "/reports/daily",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const date = qs.get("date") ?? new Date().toISOString().split("T")[0];
          ok(res, await Engine.generateBusinessReport(pool, date, qs.get("currency") ?? "USD"));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/reports",
      handler: async (req, res) => {
        const qs   = new URL(`http://x${req.url}`).searchParams;
        const rows = await pool.query(
          `SELECT * FROM business_reports WHERE ($1::text IS NULL OR report_date::text = $1) ORDER BY report_date DESC LIMIT 90`,
          [qs.get("date") ?? null],
        );
        ok(res, rows.rows);
      },
    },

    // ══════════════════════════════════════════════════════════
    // POSITIONS & ADJUSTMENTS
    // ══════════════════════════════════════════════════════════

    {
      method: "GET", pattern: "/positions",
      handler: async (req, res) => {
        try {
          const qs   = new URL(`http://x${req.url}`).searchParams;
          const date = qs.get("date") ?? new Date().toISOString().split("T")[0];
          const rows = await pool.query("SELECT * FROM intraday_positions WHERE date = $1 ORDER BY merchant_id", [date]);
          ok(res, rows.rows);
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "POST", pattern: "/adjustments",
      handler: async (_req, res, body) => {
        try {
          const b = body as Parameters<typeof Recon.createAdjustment>[1];
          if (!b?.merchantId || !b?.adjustmentType || !b?.amount || !b?.currency || !b?.description || !b?.reference || !b?.appliedBy)
            return fail(res, 422, "MISSING_FIELDS", "merchantId, adjustmentType, amount, currency, description, reference, appliedBy required");
          created(res, await Recon.createAdjustment(pool, b));
        } catch (e) { handleError(res, e); }
      },
    },
    {
      method: "GET", pattern: "/adjustments",
      handler: async (req, res) => {
        const qs   = new URL(`http://x${req.url}`).searchParams;
        const rows = await pool.query(
          "SELECT * FROM settlement_adjustments WHERE ($1::text IS NULL OR merchant_id = $1) ORDER BY created_at DESC LIMIT 100",
          [qs.get("merchantId") ?? null],
        );
        ok(res, rows.rows);
      },
    },
  ];
}
