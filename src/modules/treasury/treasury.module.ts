import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { TreasuryService } from "./treasury.service.js";
import { registerTreasuryRoutes } from "./treasury.routes.js";
import { ledgerService } from "../ledger/ledger.module.js";
import { logger } from "../../core/logger.js";

/**
 * Treasury module — float, liquidity, reserves.
 */
export const treasuryService = new TreasuryService(prisma, ledgerService);

export function registerTreasuryModule(app: FastifyInstance): void {
  registerTreasuryRoutes(app, treasuryService);
  logger.info("Treasury module registered");
}

export { TreasuryService };
