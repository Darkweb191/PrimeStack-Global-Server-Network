import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { Iso8583Service } from "./iso8583.service.js";
import { registerIso8583Routes } from "./iso8583.routes.js";
import { logger } from "../../core/logger.js";

/**
 * ISO 8583 module — message parsing, building, host connections, traces.
 */
export const iso8583Service = new Iso8583Service(prisma);

export function registerIso8583Module(app: FastifyInstance): void {
  registerIso8583Routes(app, iso8583Service);
  logger.info("ISO8583 module registered");
}

export { Iso8583Service };
