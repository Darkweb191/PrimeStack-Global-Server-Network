import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ForbiddenError, ValidationError } from "../../core/errors.js";
import { sendCreated, sendSuccess } from "../../shared/utils/response.js";
import { createHostConnectionSchema } from "../iso8583/iso8583.types.js";
import type { Iso8583Service } from "../iso8583/iso8583.service.js";

const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const bankConnectionSchema = createHostConnectionSchema
  .omit({ config: true })
  .extend({
    name: z.string().trim().min(1).max(100),
    host: z.string().trim().min(1).max(253).refine((host) => {
      if (isIP(host)) return true;
      const asciiHost = domainToASCII(host);
      return !!asciiHost && asciiHost.split(".").every((label) => domainLabel.test(label));
    }, "host must be a hostname or IP address"),
  });

const CONNECTION_MANAGEMENT_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "OPERATOR"]);
type HostConnectionRecord = Awaited<ReturnType<Iso8583Service["createHostConnection"]>>;

function assertCanManageConnections(request: FastifyRequest): void {
  const user = request.user as { role?: string } | undefined;
  if (!user?.role || !CONNECTION_MANAGEMENT_ROLES.has(user.role)) {
    throw new ForbiddenError("Your role cannot manage bank connections");
  }
}

function safeConnection(connection: HostConnectionRecord) {
  return {
    id: connection.id,
    name: connection.name,
    protocol: connection.protocol,
    host: connection.host,
    port: connection.port,
    timeout: connection.timeout,
    retries: connection.retries,
    keepAlive: connection.keepAlive,
    status: connection.status,
    lastConnectedAt: connection.lastConnectedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function registerAdminBankConnectionRoutes(
  app: FastifyInstance,
  iso8583Service: Iso8583Service,
): void {
  app.get("/admin/bank-connections", {
    preHandler: app.authenticate,
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const connections = await iso8583Service.listHostConnections();
    return sendSuccess(reply, connections.map(safeConnection));
  });

  app.post("/admin/bank-connections", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    assertCanManageConnections(request);
    const parsed = bankConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid bank connection data", { errors: parsed.error.errors });
    }

    const connection = await iso8583Service.createHostConnection(parsed.data);
    return sendCreated(reply, safeConnection(connection));
  });

  app.post("/admin/bank-connections/:id/test", {
    preHandler: app.authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    assertCanManageConnections(request);
    const { id } = request.params as { id: string };
    const result = await iso8583Service.testHostConnection(id);
    return sendSuccess(reply, result);
  });
}
