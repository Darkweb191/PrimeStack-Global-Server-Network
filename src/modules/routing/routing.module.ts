import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { RoutingService } from "./routing.service.js";
import { registerRoutingRoutes } from "./routing.routes.js";
import { logger } from "../../core/logger.js";

/**
 * Routing module — route rules, failover, BIN routing, country routing.
 */
export const routingService = new RoutingService(prisma);

export function registerRoutingModule(app: FastifyInstance): void {
  registerRoutingRoutes(app, routingService);
  logger.info("Routing module registered");
}

export { RoutingService };
