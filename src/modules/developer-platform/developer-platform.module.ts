import type { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { logger } from "../../core/logger.js";
import { DeveloperPlatformService } from "./developer-platform.service.js";
import { registerDeveloperPlatformRoutes } from "./developer-platform.routes.js";

export const developerPlatformService = new DeveloperPlatformService(prisma);

export function registerDeveloperPlatformModule(app: FastifyInstance): void {
  registerDeveloperPlatformRoutes(app, developerPlatformService);
  logger.info("Developer platform foundation module registered");
}

export { DeveloperPlatformService };
