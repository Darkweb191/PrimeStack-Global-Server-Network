import { FastifyInstance } from "fastify";
import { prisma } from "../../core/database.js";
import { ApiGatewayService } from "./api-gateway.service.js";
import { registerApiGatewayRoutes } from "./api-gateway.routes.js";
import { logger } from "../../core/logger.js";

export const apiGatewayService = new ApiGatewayService(prisma);

export function registerApiGatewayModule(app: FastifyInstance): void {
  registerApiGatewayRoutes(app, apiGatewayService);
  logger.info("API Gateway module registered");
}

export { ApiGatewayService };
