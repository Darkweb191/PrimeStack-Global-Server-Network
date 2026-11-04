import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { SwitchCoreService } from "./switch-core.service.js";
import { AuthorizationService } from "./authorization.service.js";
import { registerSwitchCoreRoutes } from "./switch-core.routes.js";
import { registerTransactionRoutes } from "./transactions.routes.js";
import { ledgerService } from "../ledger/ledger.module.js";
import { routingService } from "../routing/routing.module.js";
import { fraudService } from "../fraud/fraud.module.js";
import { logger } from "../../core/logger.js";

/**
 * Switch Core module — settlement, reconciliation, chargebacks,
 * authorization, reversal, capture.
 */
export const switchCoreService = new SwitchCoreService(prisma, ledgerService);
export const authorizationService = new AuthorizationService(
  prisma,
  routingService,
  fraudService,
);

export function registerSwitchCoreModule(app: FastifyInstance): void {
  registerSwitchCoreRoutes(app, switchCoreService);
  registerTransactionRoutes(app, authorizationService);
  logger.info("Switch Core module registered");
}

export { SwitchCoreService, AuthorizationService };
