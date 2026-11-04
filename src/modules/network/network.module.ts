import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { NetworkService } from "./network.service.js";
import { registerNetworkRoutes } from "./network.routes.js";
import { logger } from "../../core/logger.js";

export const networkService = new NetworkService(prisma);

export function registerNetworkModule(app: FastifyInstance): void {
  registerNetworkRoutes(app, networkService);
  logger.info("Network module registered");
}

export { NetworkService };
