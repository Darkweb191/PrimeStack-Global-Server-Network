import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { MonitoringService } from "./monitoring.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

/**
 * Monitoring REST routes.
 * Base path: /monitoring
 */
export function registerMonitoringRoutes(
  app: FastifyInstance,
  monitoringService: MonitoringService,
): void {
  app.get("/monitoring/dashboard", async (_request: FastifyRequest, reply: FastifyReply) => {
    const dashboard = await monitoringService.getDashboard();
    return sendSuccess(reply, dashboard);
  });

  app.get("/monitoring/transactions/live", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const limit = parseInt(String(query.limit ?? "50"), 10);
    const transactions = await monitoringService.getLiveTransactions(limit);
    return sendSuccess(reply, transactions);
  });

  app.get("/monitoring/terminals/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    const terminals = await monitoringService.getTerminalStatus();
    return sendSuccess(reply, terminals);
  });

  app.get("/monitoring/hosts/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    const hosts = await monitoringService.getHostStatus();
    return sendSuccess(reply, hosts);
  });

  app.get("/monitoring/errors", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const limit = parseInt(String(query.limit ?? "100"), 10);
    const errors = await monitoringService.getRecentErrors(limit);
    return sendSuccess(reply, errors);
  });

  app.get("/monitoring/network", async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = await monitoringService.getNetworkStats();
    return sendSuccess(reply, stats);
  });
}
