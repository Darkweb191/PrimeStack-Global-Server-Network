import { Prisma, type PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "crypto";
import { redis } from "../../core/redis.js";
import { logger } from "../../core/logger.js";
import { NotFoundError, ValidationError } from "../../core/errors.js";

/**
 * API Gateway Service
 *
 * Manages the inbound and outbound API layer:
 *   - Incoming API request logging
 *   - Outgoing API request logging
 *   - Webhooks — register, deliver, retry
 *   - API rate limiting (per-key, per-merchant)
 *   - Developer portal info (public key info, scopes, docs)
 *
 * Webhook delivery uses an at-least-once pattern:
 *   1. Event fires → create webhook_delivery record (PENDING)
 *   2. Attempt delivery via HTTP POST (signed with HMAC)
 *   3. On failure: schedule retry with exponential backoff
 *   4. After max retries: mark FAILED
 */
export class ApiGatewayService {
  constructor(private prisma: PrismaClient) {}

  // ── Incoming API Log ────────────────────────────

  async logIncomingRequest(entry: {
    merchantId?: string;
    keyId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    ipAddress?: string;
    requestSize?: number;
    responseSize?: number;
    error?: string;
  }) {
    // Write to Redis stream for real-time visibility — non-blocking
    const key = "api:logs:incoming";
    const record = {
      ts: Date.now(),
      merchantId: entry.merchantId ?? "",
      keyId: entry.keyId ?? "",
      method: entry.method,
      path: entry.path,
      status: String(entry.statusCode),
      duration: String(entry.durationMs),
      ip: entry.ipAddress ?? "",
      error: entry.error ?? "",
    };

    await redis.xadd(key, "*", ...Object.entries(record).flat());
    // Trim to last 10,000 entries
    await redis.xtrim(key, "MAXLEN", "~", 10000);
  }

  async getIncomingLogs(filters: {
    merchantId?: string;
    path?: string;
    limit?: number;
  }) {
    const key = "api:logs:incoming";
    const count = filters.limit ?? 100;

    const entries = await redis.xrevrange(key, "+", "-", "COUNT", count);

    return entries.map(([id, fields]) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      return { id, ...obj };
    }).filter((e) => {
      if (filters.merchantId && e.merchantId !== filters.merchantId) return false;
      if (filters.path && !e.path?.includes(filters.path)) return false;
      return true;
    });
  }

  // ── Webhooks ────────────────────────────────────

  /**
   * Register a webhook endpoint for a merchant.
   * Stored in Redis for fast lookup during event dispatch.
   */
  async registerWebhook(input: {
    merchantId: string;
    url: string;
    events: string[]; // e.g. ["transfer.completed", "terminal.offline"]
    label?: string;
  }) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: input.merchantId },
    });
    if (!merchant) throw new NotFoundError("Merchant", input.merchantId);

    if (!this.isValidUrl(input.url)) {
      throw new ValidationError("Invalid webhook URL — must be HTTPS");
    }

    const webhookId = `wh_${randomBytes(12).toString("hex")}`;
    const secret = randomBytes(32).toString("hex");

    const webhookData = {
      id: webhookId,
      merchantId: input.merchantId,
      url: input.url,
      events: JSON.stringify(input.events),
      label: input.label ?? "",
      secret,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    // Store in Redis hash
    const redisKey = `webhook:${webhookId}`;
    await redis.hset(redisKey, webhookData);
    await redis.sadd(`webhooks:merchant:${input.merchantId}`, webhookId);

    // Index by event for fast dispatch
    for (const event of input.events) {
      await redis.sadd(`webhooks:event:${event}`, webhookId);
    }

    logger.info({ webhookId, merchantId: input.merchantId, events: input.events }, "Webhook registered");
    return { ...webhookData, events: input.events };
  }

  async getWebhooksForMerchant(merchantId: string) {
    const webhookIds = await redis.smembers(`webhooks:merchant:${merchantId}`);
    const results = [];

    for (const id of webhookIds) {
      const data = await redis.hgetall(`webhook:${id}`);
      if (data && Object.keys(data).length > 0) {
        results.push({
          ...data,
          events: JSON.parse(data.events ?? "[]"),
        });
      }
    }

    return results;
  }

  async deleteWebhook(webhookId: string) {
    const data = await redis.hgetall(`webhook:${webhookId}`);
    if (!data || !data.merchantId) throw new NotFoundError("Webhook", webhookId);

    // Remove from all indexes
    await redis.srem(`webhooks:merchant:${data.merchantId}`, webhookId);
    const events = JSON.parse(data.events ?? "[]") as string[];
    for (const event of events) {
      await redis.srem(`webhooks:event:${event}`, webhookId);
    }
    await redis.del(`webhook:${webhookId}`);

    logger.info({ webhookId }, "Webhook deleted");
    return { webhookId, deleted: true };
  }

  /**
   * Dispatch a webhook event to all registered endpoints.
   * Signs the payload with HMAC-SHA256 using the webhook secret.
   */
  async dispatchEvent(event: string, payload: Record<string, unknown>) {
    const webhookIds = await redis.smembers(`webhooks:event:${event}`);
    const deliveries: Array<{ webhookId: string; status: string }> = [];

    for (const webhookId of webhookIds) {
      const webhook = await redis.hgetall(`webhook:${webhookId}`);
      if (!webhook || webhook.status !== "ACTIVE") continue;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      const signature = createHmac("sha256", webhook.secret)
        .update(body)
        .digest("hex");

      // Queue the delivery in Redis for async processing
      const deliveryId = `del_${randomBytes(8).toString("hex")}`;
      await redis.hset(`webhook_delivery:${deliveryId}`, {
        id: deliveryId,
        webhookId,
        url: webhook.url,
        event,
        body,
        signature,
        status: "PENDING",
        attempts: "0",
        createdAt: new Date().toISOString(),
      });

      // Add to delivery queue
      await redis.lpush("webhook:delivery_queue", deliveryId);

      deliveries.push({ webhookId, status: "QUEUED" });

      logger.info({ deliveryId, webhookId, event }, "Webhook delivery queued");
    }

    return {
      event,
      dispatched: deliveries.length,
      deliveries,
    };
  }

  async getDeliveryLog(merchantId: string, limit = 50) {
    const webhookIds = await redis.smembers(`webhooks:merchant:${merchantId}`);
    const deliveries: Array<Record<string, string>> = [];

    // Scan delivery keys for this merchant's webhooks (simplified — in production use a DB table)
    const queueLen = await redis.llen("webhook:delivery_queue");
    const recent = await redis.lrange("webhook:delivery_queue", 0, Math.min(queueLen - 1, limit * 2));

    for (const deliveryId of recent) {
      const delivery = await redis.hgetall(`webhook_delivery:${deliveryId}`);
      if (delivery && webhookIds.includes(delivery.webhookId)) {
        deliveries.push(delivery);
        if (deliveries.length >= limit) break;
      }
    }

    return deliveries;
  }

  // ── Rate Limiting ────────────────────────────────

  /**
   * Check and increment rate limit counter for an API key.
   * Returns whether the request is allowed and remaining quota.
   */
  async checkRateLimit(keyId: string, maxRequests = 100, windowSeconds = 60): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const redisKey = `ratelimit:key:${keyId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const resetAt = Math.ceil(Date.now() / (windowSeconds * 1000)) * windowSeconds;

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return { allowed: true, remaining: maxRequests - count, resetAt };
  }

  // ── Developer Portal Info ───────────────────────

  getDeveloperPortalInfo() {
    return {
      title: "PrimeStack Switch API",
      version: "1.0.0",
      baseUrl: "https://api.primestack.io/v1",
      authentication: {
        type: "HMAC-SHA256",
        headers: {
          "x-primestack-key-id": "Your public key identifier",
          "x-primestack-timestamp": "Unix timestamp (ms) — must be within 5 minutes",
          "x-primestack-signature": "HMAC-SHA256(keyId + timestamp + requestBody)",
        },
        adminRoutes: "Bearer JWT token in Authorization header",
      },
      languages: ["en", "fr", "es", "ar", "pt"],
      languageHeader: "Accept-Language: fr (or preferred language tag)",
      modules: [
        { path: "/ledger", description: "Double-entry accounting — accounts and journal entries" },
        { path: "/wallets", description: "Digital wallets — user, merchant, escrow, payout" },
        { path: "/transfers", description: "Fund movement — T2T, S2S, IP2IP, wallet, bulk" },
        { path: "/terminals", description: "Terminal management — register, health, EMV, firmware" },
        { path: "/iso8583", description: "ISO 8583 message parsing, building, and host connections" },
        { path: "/routes", description: "Routing engine — BIN, country, failover" },
        { path: "/fraud", description: "Fraud detection — velocity, blacklist, AML, risk scoring" },
        { path: "/settlement", description: "Settlement batches and reconciliation" },
        { path: "/chargebacks", description: "Chargeback management" },
        { path: "/treasury", description: "Float, liquidity pools, reserve accounts" },
        { path: "/monitoring", description: "Real-time dashboard and status feeds" },
        { path: "/merchants", description: "Merchant onboarding and management" },
        { path: "/network", description: "IP whitelist, HMAC keys, API keys, certificates" },
        { path: "/api-gateway/webhooks", description: "Webhook registration and delivery" },
        { path: "/notifications", description: "Multi-channel notifications" },
        { path: "/admin", description: "User management, audit logs, KYC (JWT protected)" },
        { path: "/docs", description: "Swagger UI — interactive API documentation" },
      ],
    };
  }

  // ── Private Helpers ─────────────────────────────

  private isValidUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === "https:";
    } catch {
      return false;
    }
  }
}
