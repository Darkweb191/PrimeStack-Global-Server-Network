import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { redis } from "../core/redis.js";
import { prisma } from "../core/database.js";
import { IpNotWhitelistedError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * IP Whitelist plugin.
 *
 * Caches the whitelist in Redis for fast lookups (TTL 60s).
 * Supports both single IPs and CIDR ranges.
 *
 * Routes can opt in to IP whitelisting by setting `config.ipWhitelist: true`
 * or the plugin can be applied globally with specific routes excluded.
 */

declare module "fastify" {
  interface FastifyContextConfig {
    ipWhitelist?: boolean;
  }
}

const WHITELIST_CACHE_KEY = "ipwhitelist:active";
const CACHE_TTL_SECONDS = 60;

function isIpInCidr(ip: string, cidr: string): boolean {
  const [base, prefixStr] = cidr.split("/");
  if (!prefixStr) return ip === cidr;

  const prefix = parseInt(prefixStr, 10);
  const ipParts = ip.split(".").map(Number);
  const baseParts = base.split(".").map(Number);

  if (ipParts.length !== 4 || baseParts.length !== 4) return false;

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const baseNum = (baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3];
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;

  return (ipNum & mask) === (baseNum & mask);
}

async function getCachedWhitelist(): Promise<string[]> {
  const cached = await redis.get(WHITELIST_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      // cache corrupted — fall through to DB
    }
  }

  const entries = await prisma.ipWhitelistEntry.findMany({
    where: { status: "ACTIVE" },
    select: { ipAddress: true },
  });

  const ips = entries.map((e) => e.ipAddress);
  await redis.set(WHITELIST_CACHE_KEY, JSON.stringify(ips), "EX", CACHE_TTL_SECONDS);
  return ips;
}

async function isIpWhitelisted(ip: string): Promise<boolean> {
  // If no whitelist entries exist at all, allow all (open mode for dev)
  const whitelist = await getCachedWhitelist();
  if (whitelist.length === 0) return true;

  for (const entry of whitelist) {
    if (isIpInCidr(ip, entry)) return true;
  }

  return false;
}

/** Invalidate the IP whitelist cache — call after CRUD operations */
export async function invalidateIpWhitelistCache(): Promise<void> {
  await redis.del(WHITELIST_CACHE_KEY);
  logger.debug("IP whitelist cache invalidated");
}

export async function ipWhitelistPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip for health checks and internal routes
    if (request.url.startsWith("/health") || request.url.startsWith("/docs")) {
      return;
    }

    // Check if route has ipWhitelist enabled
    if (request.routeOptions?.config?.ipWhitelist === false) {
      return; // explicitly disabled on this route
    }

    const clientIp = request.ip;
    const allowed = await isIpWhitelisted(clientIp);

    if (!allowed) {
      logger.warn({ ip: clientIp, url: request.url }, "IP not whitelisted — request blocked");
      throw new IpNotWhitelistedError(clientIp);
    }
  });
}

export default fp(ipWhitelistPlugin, { name: "ip-whitelist" });
