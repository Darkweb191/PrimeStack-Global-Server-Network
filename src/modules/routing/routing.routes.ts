import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { RoutingService } from "./routing.service.js";
import { createRouteSchema, updateRouteSchema } from "./routing.types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Routing REST routes.
 * Base path: /routes
 */
export function registerRoutingRoutes(
  app: FastifyInstance,
  routingService: RoutingService,
): void {
  app.post("/routes", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRouteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid route data", { errors: parsed.error.errors });
    }
    const route = await routingService.createRoute(parsed.data);
    return sendCreated(reply, route);
  });

  app.get("/routes", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await routingService.listRoutes({
      status: query.status as string | undefined,
      merchantId: query.merchantId as string | undefined,
      type: query.type as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/routes/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const route = await routingService.getRoute(id);
    return sendSuccess(reply, route);
  });

  app.patch("/routes/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateRouteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid route data", { errors: parsed.error.errors });
    }
    const route = await routingService.updateRoute(id, parsed.data);
    return sendSuccess(reply, route);
  });

  app.delete("/routes/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await routingService.deleteRoute(id);
    return sendSuccess(reply, { id, deleted: true });
  });

  // ── Route Matching ──────────────────────────────

  app.post("/routes/match", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      merchantId?: string;
      bin?: string;
      countryCode?: string;
      currency?: string;
      cardType?: string;
    };
    const route = await routingService.findRoute(body);
    return sendSuccess(reply, route);
  });

  // ── BIN Management ──────────────────────────────

  app.get("/bins", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await routingService.listBins({
      cardType: query.cardType as string | undefined,
      countryCode: query.countryCode as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.post("/bins", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const bin = await routingService.createBin(body as never);
    return sendCreated(reply, bin);
  });

  app.get("/bins/:bin", async (request: FastifyRequest, reply: FastifyReply) => {
    const { bin } = request.params as { bin: string };
    const result = await routingService.lookupBin(bin);
    return sendSuccess(reply, result);
  });
}
