import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ApiGatewayService } from "./api-gateway.service.js";
import { sendSuccess, sendCreated } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * API Gateway REST routes.
 * Base path: /api-gateway
 */
export function registerApiGatewayRoutes(
  app: FastifyInstance,
  gatewayService: ApiGatewayService,
): void {
  // ── Developer Portal ────────────────────────────

  app.get("/api-gateway/info", {
    config: { ipWhitelist: false }, // Public endpoint
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, gatewayService.getDeveloperPortalInfo());
  });

  // ── Webhooks ────────────────────────────────────

  app.get("/api-gateway/webhooks", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    if (!query.merchantId) throw new ValidationError("merchantId query param is required");
    const webhooks = await gatewayService.getWebhooksForMerchant(query.merchantId as string);
    return sendSuccess(reply, webhooks);
  });

  app.post("/api-gateway/webhooks", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      merchantId: string;
      url: string;
      events: string[];
      label?: string;
    };
    if (!body?.merchantId || !body?.url || !body?.events?.length) {
      throw new ValidationError("merchantId, url, and events are required");
    }
    const webhook = await gatewayService.registerWebhook(body);
    return sendCreated(reply, webhook);
  });

  app.delete("/api-gateway/webhooks/:webhookId", async (request: FastifyRequest, reply: FastifyReply) => {
    const { webhookId } = request.params as { webhookId: string };
    const result = await gatewayService.deleteWebhook(webhookId);
    return sendSuccess(reply, result);
  });

  // ── Webhook Dispatch (internal/admin) ──────────

  app.post("/api-gateway/webhooks/dispatch", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { event: string; payload: Record<string, unknown> };
    if (!body?.event || !body?.payload) {
      throw new ValidationError("event and payload are required");
    }
    const result = await gatewayService.dispatchEvent(body.event, body.payload);
    return sendSuccess(reply, result);
  });

  // ── Delivery Logs ───────────────────────────────

  app.get("/api-gateway/webhooks/deliveries", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    if (!query.merchantId) throw new ValidationError("merchantId query param is required");
    const limit = parseInt(String(query.limit ?? "50"), 10);
    const deliveries = await gatewayService.getDeliveryLog(query.merchantId as string, limit);
    return sendSuccess(reply, deliveries);
  });

  // ── Incoming API Logs ────────────────────────────

  app.get("/api-gateway/logs", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const logs = await gatewayService.getIncomingLogs({
      merchantId: query.merchantId as string | undefined,
      path: query.path as string | undefined,
      limit: query.limit ? parseInt(String(query.limit), 10) : 100,
    });
    return sendSuccess(reply, logs);
  });
}
