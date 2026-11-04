import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { FraudService } from "./fraud.service.js";
import { registerFraudRoutes } from "./fraud.routes.js";
import { logger } from "../../core/logger.js";

/**
 * Fraud module — velocity rules, blacklist, whitelist, AML, risk scoring.
 */
export const fraudService = new FraudService(prisma);

export function registerFraudModule(app: FastifyInstance): void {
  registerFraudRoutes(app, fraudService);
  logger.info("Fraud module registered");
}

export { FraudService };
