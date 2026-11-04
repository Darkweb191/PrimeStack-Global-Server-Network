import type { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { logger } from "../../core/logger.js";
import { PagService } from "./pag.service.js";
import { registerPagRoutes } from "./pag.routes.js";

export const pagService = new PagService(prisma);

export function registerPagModule(app: FastifyInstance): void {
  registerPagRoutes(app, pagService);
  logger.info("PrimeStack Asset Gateway module registered");
}

export { PagService };
