import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Iso8583Service } from "./iso8583.service.js";
import { parseMessageSchema, buildMessageSchema, createHostConnectionSchema } from "./iso8583.types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * ISO 8583 REST routes — message parsing, building, and host connections.
 *
 * Base path: /iso8583
 */
export function registerIso8583Routes(
  app: FastifyInstance,
  iso8583Service: Iso8583Service,
): void {
  // ── Message Parsing & Building ──────────────────

  app.post("/iso8583/parse", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = parseMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid parse request", { errors: parsed.error.errors });
    }

    const result = iso8583Service.parse(parsed.data.message, parsed.data.encoding);
    return sendSuccess(reply, result);
  });

  app.post("/iso8583/build", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = buildMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid build request", { errors: parsed.error.errors });
    }

    const message = iso8583Service.build(parsed.data.mti, parsed.data.fields, parsed.data.encoding);
    return sendSuccess(reply, { message });
  });

  // ── Host Connections ────────────────────────────

  app.post("/iso8583/hosts", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createHostConnectionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid host connection data", { errors: parsed.error.errors });
    }

    const conn = await iso8583Service.createHostConnection(parsed.data);
    return sendCreated(reply, conn);
  });

  app.get("/iso8583/hosts", async (_request: FastifyRequest, reply: FastifyReply) => {
    const hosts = await iso8583Service.listHostConnections();
    return sendSuccess(reply, hosts);
  });

  app.get("/iso8583/hosts/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const conn = await iso8583Service.getHostConnection(id);
    if (!conn) {
      return sendSuccess(reply, null);
    }
    return sendSuccess(reply, conn);
  });

  // ── Message Traces ──────────────────────────────

  app.get("/iso8583/traces", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;

    const result = await iso8583Service.listTraces({
      hostConnectionId: query.hostConnectionId as string | undefined,
      direction: query.direction as string | undefined,
      mti: query.mti as string | undefined,
      page,
      pageSize,
    });

    return sendPaginated(reply, result.data, result.meta);
  });
}
