import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { LedgerService } from "./ledger.service.js";
import { registerLedgerRoutes } from "./ledger.routes.js";
import { logger } from "../../core/logger.js";

/**
 * Ledger module — registers the service and routes.
 *
 * Exports the LedgerService instance so other modules can use it directly:
 *   import { ledgerService } from '../modules/ledger/ledger.module.js'
 */
export const ledgerService = new LedgerService(prisma);

export function registerLedgerModule(app: FastifyInstance): void {
  registerLedgerRoutes(app, ledgerService);
  logger.info("Ledger module registered");
}

export { LedgerService };
