import Fastify, { FastifyBaseLogger, FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";

import { config } from "./config/index.js";
import { logger } from "./core/logger.js";
import { enhanceAdminHtml } from "./shared/admin-ui.js";

import { initI18n } from "./core/i18n.js";
import { i18nPlugin } from "./plugins/i18n.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { ipWhitelistPlugin } from "./plugins/ip-whitelist.js";
import { hmacAuthPlugin, jwtAuthHook } from "./plugins/auth.js";
import { securityShieldPlugin } from "./plugins/security-shield.js";
import requestLogger from "./plugins/request-logger.js";

// Modules
import { registerLedgerModule } from "./modules/ledger/ledger.module.js";
import { registerWalletModule } from "./modules/wallet/wallet.module.js";
import { registerTransferModule, transferService } from "./modules/transfer/transfer.module.js";
import { registerAdminModule } from "./modules/admin/admin.module.js";
import { registerIso8583Module } from "./modules/iso8583/iso8583.module.js";
import { registerTerminalModule } from "./modules/terminal/terminal.module.js";
import { registerRoutingModule } from "./modules/routing/routing.module.js";
import { registerFraudModule } from "./modules/fraud/fraud.module.js";
import { registerTreasuryModule } from "./modules/treasury/treasury.module.js";
import { registerMonitoringModule } from "./modules/monitoring/monitoring.module.js";
import { registerHealthProxy } from "./modules/monitoring/health-proxy.js";
import { registerNotificationsModule } from "./modules/notifications/notifications.module.js";
import { registerSwitchCoreModule } from "./modules/switch-core/switch-core.module.js";
import { registerNetworkModule } from "./modules/network/network.module.js";
import { registerMerchantModule } from "./modules/merchant/merchant.module.js";
import { registerApiGatewayModule } from "./modules/api-gateway/api-gateway.module.js";
import { registerSwiftPayoutModule } from "./modules/swift-payout/swift-payout.routes.js";
import { registerPagModule } from "./modules/pag/pag.module.js";
import { registerDeveloperPlatformModule } from "./modules/developer-platform/developer-platform.module.js";
import { registerGovernanceModule } from "./modules/governance/governance.module.js";
import { registerIntelligenceModule } from "./modules/intelligence/intelligence.module.js";
import { registerS2sEngineModule } from "./modules/s2s-engine/s2s-engine.module.js";

/**
 * Create and configure the Fastify application.
 * All plugins and module routes are registered here.
 */
export async function createApp(): Promise<FastifyInstance> {
  // Initialize i18n before anything else
  await initI18n();

  const app = Fastify({
    logger: logger as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: 1048576, // 1MB
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: true,
      },
    },
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const contentType = reply.getHeader("content-type");
    if (
      !request.url.startsWith("/docs") &&
      typeof payload === "string" &&
      typeof contentType === "string" &&
      contentType.includes("text/html")
    ) {
      return enhanceAdminHtml(payload);
    }
    return payload;
  });

  // ── Core Plugins ────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // API server, not a browser app
    crossOriginEmbedderPolicy: false,
  });

  // Security headers ? prevent scraping and framing
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Robots-Tag",        "noindex, nofollow, noarchive, nosnippet");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    reply.header("Referrer-Policy",     "no-referrer");
    reply.header("Permissions-Policy",  "geolocation=(), microphone=(), camera=()");
    return payload;
  });

  await app.register(cors, {
    origin: config.app.env === "production" ? false : true,
      // In production: set to your domain e.g. "https://primestack-gsn.onrender.com"
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Accept-Language",
      `${config.hmac.headerPrefix}-key-id`,
      `${config.hmac.headerPrefix}-timestamp`,
      `${config.hmac.headerPrefix}-signature`,
      "Authorization",
    ],
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: `${config.rateLimit.window} seconds`,
    allowList: (request) =>
      request.url.startsWith("/health"),
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });

  await app.register(swagger, {
    swagger: {
      info: {
        title: "PrimeStack Global Server Network API",
        description: "Payment switch and asset gateway API",
        version: "1.0.0",
      },
      consumes: ["application/json"],
      produces: ["application/json"],
      securityDefinitions: {
        HMAC: {
          type: "apiKey",
          name: `${config.hmac.headerPrefix}-signature`,
          in: "header",
        },
        Bearer: {
          type: "apiKey",
          name: "Authorization",
          in: "header",
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "none", deepLinking: true },
  });

  // ── Custom Plugins ──────────────────────────────
  await app.register(securityShieldPlugin);
  await app.register(fp(i18nPlugin));
  await app.register(fp(errorHandlerPlugin));
  await app.register(fp(ipWhitelistPlugin));
  await app.register(fp(hmacAuthPlugin));
  await app.register(fp(jwtAuthHook));
  await app.register(requestLogger);

  // ── Module Routes ───────────────────────────────
  registerLedgerModule(app);
  registerTransferModule(app);
  registerWalletModule(app, (input) => transferService.createTransfer(input));
  registerAdminModule(app);
  registerIso8583Module(app);
  registerTerminalModule(app);
  registerRoutingModule(app);
  registerFraudModule(app);
  registerTreasuryModule(app);
  registerMonitoringModule(app);
  registerHealthProxy(app);
  registerNotificationsModule(app);
  registerSwitchCoreModule(app);
  registerNetworkModule(app);
  registerMerchantModule(app);
  registerApiGatewayModule(app);
  registerSwiftPayoutModule(app);
  registerPagModule(app);
  registerDeveloperPlatformModule(app);
  registerGovernanceModule(app);
  registerIntelligenceModule(app);
  registerS2sEngineModule(app);

  // ── Health Check ────────────────────────────────
  app.get("/health", async () => ({
    status: "ok",
    service: config.app.name,
    timestamp: new Date().toISOString(),
  }));

  logger.info("Fastify application configured");
  return app;
}
