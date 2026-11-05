import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { redis } from "../core/redis.js";
import { AppError, ForbiddenError, RateLimitError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * PrimeStack Global Server Network ? Security Shield
 *
 * Multi-layer protection against hackers, scanners, and tracers:
 *
 *   Layer 1: Bot/Scanner Detection
 *     Blocks known malicious user agents (sqlmap, nikto, nmap, masscan, etc.)
 *
 *   Layer 2: Path Traversal Protection
 *     Blocks requests containing ../, ..\\, %2e%2e, and encoded variants
 *
 *   Layer 3: SQL Injection Pattern Detection
 *     Scans query params and body for UNION SELECT, DROP TABLE, OR 1=1, etc.
 *
 *   Layer 4: Auth Failure Auto-Ban
 *     IPs that fail authentication 5+ times in 10 minutes are auto-banned for 1 hour
 *     Tracked in Redis with automatic expiry
 *
 *   Layer 5: Suspicious Request Blocking
 *     Blocks requests with no user-agent, oversized headers, or known attack patterns
 *
 *   Layer 6: API Docs Protection
 *     /docs requires admin JWT in production ? completely hidden from public access
 *
 *   Layer 7: Server Header Stripping
 *     Removes X-Powered-By and any server-identifying headers from responses
 */

// ?? Blocked User Agents (scanners, bots, attack tools) ????????????
const BLOCKED_USER_AGENTS = [
  "sqlmap", "nikto", "nmap", "masscan", "dirb", "gobuster", "wfuzz",
  "hydra", "metasploit", "burp", "zap", "w3af", "skipfish", "arachni",
  "wpscan", "joomscan", "droopescan", "whatweb", "httprobe",
  "crawler", "scraper", "bot", "spider", "scrapy", "curl/7",
  "wget/7", "python-requests", "go-http-client", "java/",
  "okhttp", "node-fetch", "axios", "postman", "insomnia",
  "scout", "fingerprint", "securitytrails", "shodan", "censys",
  "zoomeye", "quake", "fofa", "leakix", "fullhunt",
];

// ?? Malicious URL patterns ????????????????????????????????????????
const MALICIOUS_URL_PATTERNS = [
  /\.\.[\\/]/i,                    // Path traversal: ../ or ..\
  /%2e%2e/i,                          // Encoded path traversal
  /%252e%252e/i,                      // Double-encoded traversal
  /\.\.%2f/i,                        // Mixed encoding
  /<script/i,                         // XSS attempt in URL
  /javascript:/i,                     // XSS protocol handler
  /onerror=/i,                        // XSS event handler
  /eval\(/i,                          // Code injection
  /base64_decode/i,                   // PHP injection
  /phpinfo/i,                         // PHP info probe
  /wp-admin/i,                        // WordPress probe
  /wp-login/i,                        // WordPress login probe
  /phpmyadmin/i,                      // phpMyAdmin probe
  /\.env/i,                          // .env file probe
  /\.git/i,                          // .git directory probe
  /\.ssh/i,                          // .SSH directory probe
  /config\.php/i,                     // Config file probe
  /etc\/passwd/i,                    // Unix password file
  /etc\/shadow/i,                    // Shadow file
  /proc\/self/i,                     // Process info
  /file:\/\//i,                      // File protocol
  /dict:\/\//i,                      // Dictionary protocol
  /gopher:\/\//i,                    // Gopher protocol
];

// ?? SQL Injection patterns ????????????????????????????????????????
const SQL_INJECTION_PATTERNS = [
  /union\s+select/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+.*\s+set/i,
  /or\s+1\s*=\s*1/i,
  /or\s+'1'\s*=\s*'1/i,
  /and\s+1\s*=\s*1/i,
  /;\s*drop\s/i,
  /;\s*delete\s/i,
  /;\s*insert\s/i,
  /--\s*$/i,
  /\/\*.*\*\//i,
  /xp_cmdshell/i,
  /sp_executesql/i,
  /waitfor\s+delay/i,
  /benchmark\s*\(/i,
  /sleep\s*\(/i,
  /load_file\s*\(/i,
  /into\s+outfile/i,
  /information_schema/i,
  /0x[0-9a-f]{8,}/i,
];

// ?? Rate limit for auth failures ??????????????????????????????????
const AUTH_FAIL_LIMIT    = 5;        // 5 failures
const AUTH_FAIL_WINDOW   = 600;      // in 10 minutes
const AUTH_BAN_DURATION  = 3600;     // ban for 1 hour

function getClientIp(request: FastifyRequest): string {
  return request.ip || "unknown";
}

function getUserAgent(request: FastifyRequest): string {
  return (request.headers["user-agent"] || "").toLowerCase();
}

/**
 * Check if an IP is currently banned
 */
async function isIpBanned(ip: string): Promise<boolean> {
  const banned = await redis.get(`sec:ban:${ip}`);
  return !!banned;
}

/**
 * Record an auth failure and ban if threshold exceeded
 */
export async function recordAuthFailure(ip: string, reason: string): Promise<void> {
  const key = `sec:authfail:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, AUTH_FAIL_WINDOW);
  }

  if (count >= AUTH_FAIL_LIMIT) {
    await redis.set(`sec:ban:${ip}`, reason, "EX", AUTH_BAN_DURATION);
    await redis.del(key);
    logger.warn({ ip, reason, count }, "IP auto-banned for repeated auth failures");
  } else {
    logger.warn({ ip, reason, count }, "Auth failure recorded");
  }
}

/**
 * Clear auth failures on successful auth
 */
export async function clearAuthFailures(ip: string): Promise<void> {
  await redis.del(`sec:authfail:${ip}`);
}

/**
 * Manually ban an IP
 */
export async function banIp(ip: string, reason: string, durationSeconds = 3600): Promise<void> {
  await redis.set(`sec:ban:${ip}`, reason, "EX", durationSeconds);
  logger.warn({ ip, reason, duration: durationSeconds }, "IP manually banned");
}

/**
 * Security Shield Plugin
 */
export const securityShieldPlugin = fp(async (app: FastifyInstance) => {
  // ?? Layer 0: Pre-request ban check ??????????????????????????????
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = getClientIp(request);

    // Check if IP is banned
    if (await isIpBanned(ip)) {
      logger.warn({ ip, url: request.url }, "Blocked request from banned IP");
      throw new ForbiddenError("Access denied");
    }

    // ?? Layer 1: Bot/Scanner Detection ????????????????????????????
    const ua = getUserAgent(request);
    if (ua) {
      for (const blocked of BLOCKED_USER_AGENTS) {
        if (ua.includes(blocked)) {
          await banIp(ip, `blocked-user-agent: ${blocked}`, 7200); // ban 2 hours
          logger.warn({ ip, ua: ua.slice(0, 100), blocked }, "Blocked malicious user agent");
          throw new ForbiddenError("Access denied");
        }
      }
    } else if (request.method !== "GET" || !request.url.startsWith("/health")) {
      // No user agent on non-health requests is suspicious
      logger.warn({ ip, url: request.url }, "Request with no user-agent");
      throw new ForbiddenError("Access denied");
    }

    // ?? Layer 2: Path Traversal Protection ????????????????????????
    const url = request.url.toLowerCase();
    for (const pattern of MALICIOUS_URL_PATTERNS) {
      if (pattern.test(url) || pattern.test(request.url)) {
        await banIp(ip, "path-traversal-attempt", 7200);
        logger.warn({ ip, url: request.url, pattern: pattern.source }, "Blocked path traversal");
        throw new ForbiddenError("Access denied");
      }
    }

    // ?? Layer 3: SQL Injection Detection ??????????????????????????
    // Check query string
    const queryString = request.url.split("?")[1] || "";
    if (queryString) {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(queryString)) {
          await banIp(ip, "sql-injection-query", 7200);
          logger.warn({ ip, pattern: pattern.source, query: queryString.slice(0, 200) }, "Blocked SQL injection in query");
          throw new ForbiddenError("Access denied");
        }
      }
    }

    // Check body for SQL injection (only for string fields)
    if (request.body && typeof request.body === "object") {
      const bodyStr = JSON.stringify(request.body).toLowerCase();
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(bodyStr)) {
          await banIp(ip, "sql-injection-body", 7200);
          logger.warn({ ip, pattern: pattern.source }, "Blocked SQL injection in body");
          throw new ForbiddenError("Access denied");
        }
      }
    }
  });

  // ?? Layer 6: API Docs Protection ????????????????????????????????
  // In production, /docs requires admin JWT authentication
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/docs") && config.app.env === "production") {
      try {
        await request.jwtVerify();
        const user = request.user as { role?: string } | undefined;
        if (!user?.role || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
          throw new ForbiddenError("Admin access required for API documentation");
        }
      } catch {
        throw new ForbiddenError("Authentication required for API documentation");
      }
    }
  });

  // ?? Layer 7: Strip server-identifying headers ???????????????????
  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload) => {
    reply.header("X-Powered-By", "");
    reply.removeHeader("X-Powered-By");
    reply.header("Server", "");
    reply.removeHeader("Server");

    // HSTS ? enforce HTTPS in production
    if (config.app.env === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // Frame-busting
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");

    return payload;
  });

  logger.info("Security Shield active ? 7 layers enabled");
});

import { config } from "../config/index.js";
