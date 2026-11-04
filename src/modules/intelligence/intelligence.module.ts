import type { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { logger } from "../../core/logger.js";
import { IntelligenceService } from "./intelligence.service.js";
import { registerIntelligenceRoutes } from "./intelligence.routes.js";

export const intelligenceService = new IntelligenceService(prisma);

export function registerIntelligenceModule(app: FastifyInstance): void {
  registerIntelligenceRoutes(app, intelligenceService);
  logger.info("Read-only intelligence module registered");
}

export { IntelligenceService };
