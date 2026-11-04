import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { AdminService } from "./admin.service.js";
import { registerAdminRoutes } from "./admin.routes.js";
import { commandCenterHtml } from "./command-center.js";
import { logger } from "../../core/logger.js";
import { iso8583Service } from "../iso8583/iso8583.module.js";
import { registerAdminBankConnectionRoutes } from "./bank-connections.routes.js";
import { registerAdminBankAccountProfileRoutes } from "./bank-account-profiles.routes.js";

/**
 * Admin module — user management, authentication, audit logs, KYC.
 */
export const adminService = new AdminService(prisma);

export function registerAdminModule(app: FastifyInstance): void {
  app.get("/admin/dashboard", async (_request, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(commandCenterHtml),
  );
  registerAdminRoutes(app, adminService);
  registerAdminBankConnectionRoutes(app, iso8583Service);
  registerAdminBankAccountProfileRoutes(app, prisma);
  logger.info("Admin module registered");
}

export { AdminService };
