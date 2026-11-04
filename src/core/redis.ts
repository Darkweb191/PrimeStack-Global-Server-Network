import IORedis from "ioredis";
import { logger } from "./logger.js";

/**
 * Redis client singleton.
 * Supports both:
 *   - REDIS_URL (Render managed Redis — rediss://...)
 *   - REDIS_HOST + REDIS_PORT (local Docker)
 */

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error("Redis connection failed after 10 retries");
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    })
  : new IORedis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || "0", 10),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error("Redis connection failed after 10 retries");
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));

export type Redis = typeof redis;