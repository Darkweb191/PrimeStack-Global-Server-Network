import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SwitchCoreService } from "./switch-core.service.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Switch Core REST routes — settlement, reconciliation, chargebacks.
 * Base path: /settlement, /reconciliation, /chargebacks
 */
export function registerSwitchCoreRoutes(
  app: FastifyInstance,
  switchCoreService: SwitchCoreService,
): void {
  // ── Settlement ───────────────────────────────────

  app.post("/settlement/batches", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { merchantId: string; period?: string; currency?: string };
    if (!body?.merchantId) {
      throw new ValidationError("merchantId is required");
    }
    const result = await switchCoreService.createSettlementBatch(body.merchantId, body.period, body.currency);
    return sendCreated(reply, result);
  });

  app.get("/settlement/batches", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await switchCoreService.listSettlementBatches({
      merchantId: query.merchantId as string | undefined,
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/settlement/batches/:batchNumber", async (request: FastifyRequest, reply: FastifyReply) => {
    const { batchNumber } = request.params as { batchNumber: string };
    const batch = await switchCoreService.getSettlementBatch(batchNumber);
    return sendSuccess(reply, batch);
  });

  // ── Reconciliation ──────────────────────────────

  app.post("/reconciliation", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.source || !body?.reference || body?.expectedAmount === undefined || body?.actualAmount === undefined) {
      throw new ValidationError("source, reference, expectedAmount, and actualAmount are required");
    }
    const record = await switchCoreService.createReconciliationRecord(body as never);
    return sendCreated(reply, record);
  });

  app.get("/reconciliation", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await switchCoreService.listReconciliations({
      settlementBatchId: query.settlementBatchId as string | undefined,
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/reconciliation/:id/resolve", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { resolvedBy: string; notes?: string };
    const record = await switchCoreService.resolveReconciliation(id, body.resolvedBy, body.notes);
    return sendSuccess(reply, record);
  });

  // ── Chargebacks ──────────────────────────────────

  app.post("/chargebacks", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.transactionId || !body?.caseNumber || !body?.amount) {
      throw new ValidationError("transactionId, caseNumber, and amount are required");
    }
    const chargeback = await switchCoreService.createChargeback(body as never);
    return sendCreated(reply, chargeback);
  });

  app.get("/chargebacks", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await switchCoreService.listChargebacks({
      status: query.status as string | undefined,
      transactionId: query.transactionId as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/chargebacks/:caseNumber/process", async (request: FastifyRequest, reply: FastifyReply) => {
    const { caseNumber } = request.params as { caseNumber: string };
    const body = request.body as { action: "ACCEPTED" | "CONTESTED"; processedBy?: string };
    if (!body?.action) {
      throw new ValidationError("action is required (ACCEPTED or CONTESTED)");
    }
    const chargeback = await switchCoreService.processChargeback(caseNumber, body.action, body.processedBy);
    return sendSuccess(reply, chargeback);
  });
}
