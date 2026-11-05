import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { redis } from "../core/redis.js";
import { ForbiddenError } from "../core/errors.js";
import { config } from "../config/index.js";
import { logger } from "../core/logger.js";

/**
 * Security Shield Plugin
 * Blocks banned IPs, malicious user agents, and suspicious requests.
 */

const AUTH_FAIL_LIMIT = 5;
const AUTH_FAIL_WINDOW = 600;
const AUTH_BAN_DURATION = 3600;

const BLOCKED_UA = [
  "sqlmap", "nikto", "nmap", "masscan", "dirb", "gobuster", "wfuzz",
  "hydra", "metasploit", "burp", "zap", "w3af", "skipfish", "arachni",
  "wpscan", "joomscan", "droopescan", "whatweb", "httprobe",
  "scout", "fingerprint", "securitytrails", "shodan", "censys",
  "zoomeye", "quake", "fofa", "leakix", "fullhunt",
];

const MALICIOUS_URL = [
  /\.\.[\\/]/i, /%2e%2e/i, /%252e%252e/i, /\.\.%2f/i,
  /<script/i, /javascript:/i, /onerror=/i, /eval\(/i,
  /phpinfo/i, /wp-admin/i, /wp-login/i, /phpmyadmin/i,
  /\.env/i, /\.git/i, /\.ssh/i, /config\.php/i,
  /etc\/passwd/i, /etc\/shadow/i, /proc\/self/i,
  /file:\/\//i, /dict:\/\//i, /gopher:\/\//i,
];

const SQL_INJECTION = [
  /union\s+select/i, /drop\s+table/i, /insert\s+into/i,
  /delete\s+from/i, /or\s+1\s*=\s*1/i, /;\s*drop\s/i,
  /--\s*$/i, /sleep\s*\(/i, /benchmark\s*\(/i,
  /information_schema/i,
];

export async function recordAuthFailure(ip: string, reason: string): Promise<void> {
  const key = "sec:authfail:" + ip;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, AUTH_FAIL_WINDOW);
  if (count >= AUTH_FAIL_LIMIT) {
    await redis.set("sec:ban:" + ip, reason, "EX", AUTH_BAN_DURATION);
    await redis.del(key);
    logger.warn({ ip, reason }, "IP auto-banned for auth failures");
  }
}

export async function clearAuthFailures(ip: string): Promise<void> {
  await redis.del("sec:authfail:" + ip);
}

export async function banIp(ip: string, reason: string, duration: number = 3600): Promise<void> {
  await redis.set("sec:ban:" + ip, reason, "EX", duration);
  logger.warn({ ip, reason }, "IP banned");
}

export const securityShieldPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const ip = request.ip || "unknown";
    const ua = ((request.headers["user-agent"] || "") as string).toLowerCase();

    // Check ban list
    const banned = await redis.get("sec:ban:" + ip);
    if (banned) {
      throw new ForbiddenError("Access denied");
    }

    // Bot detection
    if (ua) {
      for (const blocked of BLOCKED_UA) {
        if (ua.includes(blocked)) {
          await banIp(ip, "blocked-ua:" + blocked, 7200);
          throw new ForbiddenError("Access denied");
        }
      }
    } else if (request.method !== "GET" || !request.url.startsWith("/health")) {
      throw new ForbiddenError("Access denied");
    }

    // Path traversal
    const url = request.url.toLowerCase();
    for (const pattern of MALICIOUS_URL) {
      if (pattern.test(url)) {
        await banIp(ip, "path-traversal", 7200);
        throw new ForbiddenError("Access denied");
      }
    }

    // SQL injection in query
    const qs = request.url.split("?")[1] || "";
    if (qs) {
      for (const pattern of SQL_INJECTION) {
        if (pattern.test(qs)) {
          await banIp(ip, "sql-injection", 7200);
          throw new ForbiddenError("Access denied");
        }
      }
    }

    // SQL injection in body
    if (request.body && typeof request.body === "object") {
      const bodyStr = JSON.stringify(request.body).toLowerCase();
      for (const pattern of SQL_INJECTION) {
        if (pattern.test(bodyStr)) {
          await banIp(ip, "sql-injection-body", 7200);
          throw new ForbiddenError("Access denied");
        }
      }
    }
  });

  // Strip identifying headers
  app.addHook("onSend", async (_request: FastifyRequest, reply: FastifyReply, payload) => {
    reply.removeHeader("X-Powered-By");
    reply.removeHeader("Server");
    if (config.app.env === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    return payload;
  });

  logger.info("Security Shield active");
});
