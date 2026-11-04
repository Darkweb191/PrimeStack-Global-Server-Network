import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./core/logger.js";
import { prisma } from "./core/database.js";
import { redis } from "./core/redis.js";

/**
 * PrimeStack Switch — Server Entry Point
 */
async function start(): Promise<void> {
  try {
    const app = await createApp();

    await app.listen({
      port: config.app.port,
      host: config.app.host,
    });

    logger.info(
      { host: config.app.host, port: config.app.port, env: config.app.env },
      `PrimeStack Switch started — ${config.app.env} mode`,
    );

    logger.info(
      { docs: `http://localhost:${config.app.port}/docs` },
      "API documentation available at /docs",
    );

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const sig of signals) {
      process.on(sig, async () => {
        logger.info({ signal: sig }, "Shutting down gracefully...");
        await app.close();
        await prisma.$disconnect();
        redis.quit();
        logger.info("Server closed");
        process.exit(0);
      });
    }
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

start();
