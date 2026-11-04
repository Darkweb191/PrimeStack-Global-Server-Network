import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { NotificationService } from "./notifications.service.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Notification REST routes.
 * Base path: /notifications
 */
export function registerNotificationRoutes(
  app: FastifyInstance,
  notificationService: NotificationService,
): void {
  // ── Send ────────────────────────────────────────

  app.post("/notifications/send", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.code || !body?.channel || !body?.recipient) {
      throw new ValidationError("code, channel, and recipient are required");
    }
    const notification = await notificationService.send({
      code: body.code as string,
      channel: body.channel as never,
      language: body.language as string | undefined,
      recipient: body.recipient as string,
      data: (body.data as Record<string, string>) ?? {},
      merchantId: body.merchantId as string | undefined,
      type: body.type as string | undefined,
    });
    return sendCreated(reply, notification);
  });

  // ── List ────────────────────────────────────────

  app.get("/notifications", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await notificationService.listNotifications({
      merchantId: query.merchantId as string | undefined,
      type: query.type as string | undefined,
      status: query.status as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  // ── Templates ────────────────────────────────────

  app.get("/notifications/templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const templates = await notificationService.listTemplates({
      code: query.code as string | undefined,
      language: query.language as string | undefined,
      channel: query.channel as string | undefined,
    });
    return sendSuccess(reply, templates);
  });

  app.post("/notifications/templates", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body?.code || !body?.type || !body?.channel || !body?.language || !body?.body) {
      throw new ValidationError("code, type, channel, language, and body are required");
    }
    const template = await notificationService.createTemplate(body as never);
    return sendCreated(reply, template);
  });
}
