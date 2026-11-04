import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { TerminalService } from "./terminal.service.js";
import { registerTerminalRoutes } from "./terminal.routes.js";
import { logger } from "../../core/logger.js";

/**
 * Terminal module — registration, health, remote commands, EMV, firmware.
 */
export const terminalService = new TerminalService(prisma);

export function registerTerminalModule(app: FastifyInstance): void {
  registerTerminalRoutes(app, terminalService);
  logger.info("Terminal module registered");
}

export { TerminalService };
