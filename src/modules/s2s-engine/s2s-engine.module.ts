import type { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { logger } from "../../core/logger.js";
import { ledgerService } from "../ledger/ledger.module.js";
import { walletService } from "../wallet/wallet.module.js";
import { S2sEngineService } from "./s2s-engine.service.js";
import { registerS2sEngineRoutes } from "./s2s-engine.routes.js";

/**
 * S2S Engine Module
 *
 * Wires up the S2sEngineService singleton with its dependencies
 * (prisma, ledgerService, walletService) and registers all S2S routes.
 *
 * Also starts a background interval to prune expired nonce rows from
 * the S2sNonce table every 15 minutes (Redis TTL already prevents
 * replays; this just keeps the DB table from growing unbounded).
 */
export const s2sEngineService = new S2sEngineService(
  prisma,
  ledgerService,
  walletService,
);

/** Interval handle — kept so tests can clear it */
let _nonceCleanupInterval: ReturnType<typeof setInterval> | undefined;

export function registerS2sEngineModule(app: FastifyInstance): void {
  registerS2sEngineRoutes(app, s2sEngineService);

  // Start nonce cleanup every 15 minutes
  _nonceCleanupInterval = setInterval(async () => {
    try {
      await s2sEngineService.cleanupExpiredNonces();
    } catch (err) {
      logger.warn({ err }, "S2S nonce cleanup error");
    }
  }, 15 * 60 * 1000);

  // Cleanup on server close so the process can exit cleanly
  app.addHook("onClose", async () => {
    if (_nonceCleanupInterval) {
      clearInterval(_nonceCleanupInterval);
      _nonceCleanupInterval = undefined;
    }
  });

  logger.info("S2S Engine module registered");
}

export { S2sEngineService };
