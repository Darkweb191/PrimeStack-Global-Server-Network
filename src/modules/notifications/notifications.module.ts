import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { NotificationService } from "./notifications.service.js";
import { registerNotificationRoutes } from "./notifications.routes.js";
import { logger } from "../../core/logger.js";

/**
 * Notifications module — multi-channel notifications with i18n templates.
 */
export const notificationService = new NotificationService(prisma);

export function registerNotificationsModule(app: FastifyInstance): void {
  registerNotificationRoutes(app, notificationService);
  logger.info("Notifications module registered");
}

export { NotificationService };
