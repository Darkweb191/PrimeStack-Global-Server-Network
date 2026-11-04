import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { redis } from "../core/redis.js";

/**
 * Request Logger Plugin
 *
 * Writes every API request to a Redis stream for real-time visibility
 * in the API Gateway module. Fires on onResponse so we capture
 * the actual status code and duration.
 *
 * This is a lightweight, non-blocking log — it never blocks a request.
 */
async function requestLoggerPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip health and docs
    if (request.url.startsWith("/health") || request.url.startsWith("/docs")) return;

    const duration = reply.elapsedTime;

    const record = {
      ts: Date.now().toString(),
      method: request.method,
      path: request.url.split("?")[0], // strip query string
      status: String(reply.statusCode),
      duration: duration ? duration.toFixed(1) : "0",
      ip: request.ip ?? "",
      merchantId: (request.merchant?.id) ?? "",
      keyId: (request.apiKey?.keyId) ?? "",
    };

    // Non-blocking fire-and-forget
    redis
      .xadd("api:logs:incoming", "*", ...Object.entries(record).flat())
      .then(() => redis.xtrim("api:logs:incoming", "MAXLEN", "~", 10000))
      .catch(() => {
        // silently ignore log failures — never affect request handling
      });
  });
}

export default fp(requestLoggerPlugin, { name: "request-logger" });
