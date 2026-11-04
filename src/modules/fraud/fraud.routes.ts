import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { FraudService } from "./fraud.service.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Fraud REST routes.
 * Base path: /fraud
 */
export function registerFraudRoutes(
  app: FastifyInstance,
  fraudService: FraudService,
): void {
  // ── Evaluate ────────────────────────────────────

  app.post("/fraud/evaluate", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.amount) {
      throw new ValidationError("amount is required");
    }
    const result = await fraudService.evaluate({
      merchantId: body.merchantId as string | undefined,
      cardNumber: body.cardNumber as string | undefined,
      ipAddress: body.ipAddress as string | undefined,
      walletAddress: body.walletAddress as string | undefined,
      amount: String(body.amount),
      currency: (body.currency as string) ?? "USD",
      deviceId: body.deviceId as string | undefined,
    });
    return sendSuccess(reply, result);
  });

  // ── Blacklist ────────────────────────────────────

  app.get("/fraud/blacklist", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await fraudService.listBlacklist({
      type: query.type as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/fraud/blacklist", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { type: string; value: string; reason?: string; expiresAt?: string };
    const entry = await fraudService.addToBlacklist(
      body.type,
      body.value,
      body.reason,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
    return sendCreated(reply, entry);
  });

  app.delete("/fraud/blacklist/:type/:value", async (request: FastifyRequest, reply: FastifyReply) => {
    const { type, value } = request.params as { type: string; value: string };
    await fraudService.removeFromBlacklist(type, value);
    return sendSuccess(reply, { type, value, removed: true });
  });

  // ── Whitelist ────────────────────────────────────

  app.post("/fraud/whitelist", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { type: string; value: string; reason?: string; expiresAt?: string };
    const entry = await fraudService.addToWhitelist(
      body.type,
      body.value,
      body.reason,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    );
    return sendCreated(reply, entry);
  });

  // ── Rules ────────────────────────────────────────

  app.get("/fraud/rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await fraudService.listRules({
      type: query.type as string | undefined,
      status: query.status as string | undefined,
      merchantId: query.merchantId as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/fraud/rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const rule = await fraudService.createRule(body as never);
    return sendCreated(reply, rule);
  });

  // ── Risk Scores ─────────────────────────────────

  app.get("/fraud/risk-scores", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await fraudService.getRiskScores({
      entityType: query.entityType as string | undefined,
      level: query.level as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });
}
