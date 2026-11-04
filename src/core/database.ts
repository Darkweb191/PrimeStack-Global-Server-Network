import { PrismaClient } from "@prisma/client";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

/**
 * Prisma client singleton.
 * Used across all modules for database access.
 */
const prismaClient = new PrismaClient({
  log: config.app.env === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});

prismaClient
  .$connect()
  .then(() => logger.info("Database connected"))
  .catch((err) => logger.fatal({ err }, "Failed to connect to database"));

export const prisma = prismaClient;
export type Prisma = typeof prismaClient;
