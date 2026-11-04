import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { WalletService, type WalletTransferInput } from "./wallet.service.js";
import { registerWalletRoutes } from "./wallet.routes.js";
import { ledgerService } from "../ledger/ledger.module.js";
import { ForbiddenError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { walletDashboardHtml } from "./wallet-dashboard.js";

/**
 * Wallet module — registers the service and routes.
 *
 * Exports the WalletService instance for use by other modules
 * (transfers, payouts, settlement).
 */
export const walletService = new WalletService(prisma, ledgerService);

export function registerWalletModule(
  app: FastifyInstance,
  transferExecutor?: (input: WalletTransferInput) => Promise<unknown>,
): void {
  if (transferExecutor) walletService.setTransferExecutor(transferExecutor);
  app.get("/admin/wallet-dashboard", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").header("Cache-Control", "no-store").send(walletDashboardHtml);
  });
  app.register(async (adminApp) => {
    adminApp.addHook("preHandler", async (request, reply) => {
      await adminApp.authenticate(request, reply);
      const role = (request.user as { role?: string } | undefined)?.role;
      const permittedRoles = request.method === "GET" || request.method === "HEAD"
        ? ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"]
        : ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
      if (!role || !permittedRoles.includes(role)) {
        throw new ForbiddenError("Your admin role cannot perform this wallet operation");
      }
    });
    registerWalletRoutes(adminApp, walletService);
  }, { prefix: "/admin" });
  registerWalletRoutes(app, walletService);
  logger.info("Wallet module registered");
}

export { WalletService };
