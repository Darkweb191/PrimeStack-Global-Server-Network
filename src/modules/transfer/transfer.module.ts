import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { TransferService } from "./transfer.service.js";
import { registerTransferRoutes } from "./transfer.routes.js";
import { ledgerService } from "../ledger/ledger.module.js";
import { walletService } from "../wallet/wallet.module.js";
import { logger } from "../../core/logger.js";

/**
 * Transfer module — registers the service and routes.
 *
 * Exports the TransferService instance for use by other modules
 * (settlement, payouts, wallet transfers).
 */
export const transferService = new TransferService(prisma, ledgerService, walletService);

export function registerTransferModule(app: FastifyInstance): void {
  registerTransferRoutes(app, transferService);
  logger.info("Transfer module registered");
}

export { TransferService };
