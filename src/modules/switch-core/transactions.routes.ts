import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuthorizationService } from "./authorization.service.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { NotFoundError, ValidationError } from "../../core/errors.js";
import { renderTransactionSummary } from "./transaction-summary.js";

/**
 * Transaction (authorization, reversal, capture) REST routes.
 * Base path: /transactions
 */
export function registerTransactionRoutes(
  app: FastifyInstance,
  authService: AuthorizationService,
): void {
  // ── Authorization ───────────────────────────────

  app.post("/transactions/authorize", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      tid: string;
      amount: string;
      currency?: string;
      cardNumber?: string;
      cardBin?: string;
      cardType?: string;
      countryCode?: string;
      isoFields?: Record<string, string>;
    };

    if (!body?.tid || !body?.amount) {
      throw new ValidationError("tid and amount are required");
    }

    const result = await authService.authorize({
      tid: body.tid,
      amount: body.amount,
      currency: body.currency ?? "USD",
      cardNumber: body.cardNumber,
      cardBin: body.cardBin,
      cardType: body.cardType,
      countryCode: body.countryCode,
      isoFields: body.isoFields,
      ipAddress: request.ip,
    });

    const statusCode = result.approved ? 200 : 402;
    return reply.status(statusCode).send({ success: result.approved, data: result });
  });

  // ── Reversal ────────────────────────────────────

  app.post("/transactions/reverse", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      originalStan: string;
      tid: string;
      amount: string;
      reason?: string;
    };

    if (!body?.originalStan || !body?.tid || !body?.amount) {
      throw new ValidationError("originalStan, tid, and amount are required");
    }

    const result = await authService.reverse(body);
    return sendSuccess(reply, result);
  });

  // ── Capture ─────────────────────────────────────

  app.post("/transactions/capture", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      stan: string;
      rrn: string;
      amount?: string;
    };

    if (!body?.stan || !body?.rrn) {
      throw new ValidationError("stan and rrn are required");
    }

    const result = await authService.capture(body);
    return sendSuccess(reply, result);
  });

  // ── List & Get ──────────────────────────────────

  app.get("/transactions", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;

    const result = await authService.listTransactions({
      merchantId: query.merchantId as string | undefined,
      terminalId: query.terminalId as string | undefined,
      status: query.status as string | undefined,
      type: query.type as string | undefined,
      page,
      pageSize,
    });

    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/transactions/:stan", async (request: FastifyRequest, reply: FastifyReply) => {
    const { stan } = request.params as { stan: string };
    const transaction = await authService.getTransaction(stan);
    return sendSuccess(reply, transaction);
  });

  app.get("/transactions/:stan/summary", async (request: FastifyRequest, reply: FastifyReply) => {
    const { stan } = request.params as { stan: string };
    const transaction = await authService.getTransaction(stan);
    if (!request.merchant?.id || request.merchant.id !== transaction.merchantId) {
      throw new NotFoundError("Transaction", stan);
    }
    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(renderTransactionSummary(transaction));
  });
}
