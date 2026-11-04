import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { MerchantService } from "./merchant.service.js";
import {
  registerMerchantPortalRoutes,
  registerMerchantRoutes,
} from "./merchant.routes.js";
import { merchantDashboardHtml } from "./merchant-dashboard.js";
import { merchantHomeHtml } from "./merchant-home.js";
import { logger } from "../../core/logger.js";
import { ForbiddenError } from "../../core/errors.js";

export const merchantService = new MerchantService(prisma);

export function registerMerchantModule(app: FastifyInstance): void {
  app.get("/admin/merchant-dashboard", async (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(merchantDashboardHtml),
  );
  app.get("/admin/merchant-home", async (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(merchantHomeHtml),
  );
  app.register(
    async (adminApp) => {
      adminApp.addHook("preHandler", async (request, reply) => {
        await adminApp.authenticate(request, reply);
        const role = (request.user as { role?: string } | undefined)?.role;
        const permittedRoles =
          request.method === "GET" || request.method === "HEAD"
            ? ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"]
            : request.url.includes("/kyc-documents/")
              ? ["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER"]
              : ["SUPER_ADMIN", "ADMIN", "OPERATOR"];
        if (!role || !permittedRoles.includes(role)) {
          throw new ForbiddenError(
            "Your admin role cannot perform this merchant operation",
          );
        }
      });
      registerMerchantRoutes(adminApp, merchantService);
    },
    { prefix: "/admin" },
  );
  registerMerchantPortalRoutes(app, merchantService);
  logger.info("Merchant module registered");
}

export { MerchantService };
