import type { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { logger } from "../../core/logger.js";
import { GovernanceService } from "./governance.service.js";
import { registerGovernanceRoutes } from "./governance.routes.js";

export const governanceService = new GovernanceService(prisma);

export function registerGovernanceModule(app: FastifyInstance): void {
  registerGovernanceRoutes(app, governanceService);
  logger.info("Enterprise governance foundation module registered");
}

export { GovernanceService };
