import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TerminalService } from "./terminal.service.js";
import {
  registerTerminalSchema,
  updateTerminalSchema,
  updateHealthSchema,
  remoteCommandSchema,
} from "./types.js";
import { sendSuccess, sendCreated, sendPaginated, parsePagination } from "../../shared/utils/response.js";
import { ValidationError } from "../../core/errors.js";

/**
 * Terminal REST routes.
 *
 * Base path: /terminals
 */
export function registerTerminalRoutes(
  app: FastifyInstance,
  terminalService: TerminalService,
): void {
  app.post("/terminals", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = registerTerminalSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid terminal data", { errors: parsed.error.errors });
    }
    const terminal = await terminalService.registerTerminal(parsed.data);
    return sendCreated(reply, terminal);
  });

  app.get("/terminals", async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, pageSize } = parsePagination(request.query as Record<string, unknown>);
    const query = request.query as Record<string, unknown>;
    const result = await terminalService.listTerminals({
      merchantId: query.merchantId as string | undefined,
      status: query.status as string | undefined,
      country: query.country as string | undefined,
      page,
      pageSize,
    });
    return sendPaginated(reply, result.data, result.meta);
  });

  app.get("/terminals/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const terminal = await terminalService.getTerminal(id);
    return sendSuccess(reply, terminal);
  });

  app.patch("/terminals/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTerminalSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid update data", { errors: parsed.error.errors });
    }
    const terminal = await terminalService.updateTerminal(id, parsed.data);
    return sendSuccess(reply, terminal);
  });

  app.delete("/terminals/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await terminalService.deleteTerminal(id);
    return sendSuccess(reply, { id, status: "DECOMMISSIONED" });
  });

  // ── Health ──────────────────────────────────────

  app.get("/terminals/:id/health", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const health = await terminalService.getHealth(id);
    return sendSuccess(reply, health);
  });

  app.post("/terminals/:id/health", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateHealthSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid health data", { errors: parsed.error.errors });
    }
    const health = await terminalService.updateHealth(id, parsed.data);
    return sendSuccess(reply, health);
  });

  // ── Remote Commands ─────────────────────────────

  app.post("/terminals/commands", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = remoteCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid command data", { errors: parsed.error.errors });
    }
    const command = await terminalService.sendCommand(parsed.data);
    return sendCreated(reply, command);
  });

  app.get("/terminals/:id/commands", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const commands = await terminalService.getPendingCommands(id);
    return sendSuccess(reply, commands);
  });

  app.post("/terminals/commands/:commandId/ack", async (request: FastifyRequest, reply: FastifyReply) => {
    const { commandId } = request.params as { commandId: string };
    const command = await terminalService.ackCommand(commandId);
    return sendSuccess(reply, command);
  });

  // ── EMV Parameters ──────────────────────────────

  app.get("/terminals/:id/emv", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const params = await terminalService.getEmvParameters(id);
    return sendSuccess(reply, params);
  });

  app.post("/terminals/:id/emv", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { aid: string; label: string; version?: string; config?: Record<string, unknown> };
    if (!body?.aid || !body?.label) {
      throw new ValidationError("aid and label are required");
    }
    const param = await terminalService.setEmvParameter(id, body.aid, body.label, body.version, body.config);
    return sendCreated(reply, param);
  });

  // ── Firmware ────────────────────────────────────

  app.get("/terminals/firmware/versions", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const versions = await terminalService.listFirmwareVersions(query.model as string | undefined);
    return sendSuccess(reply, versions);
  });

  app.post("/terminals/firmware/versions", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      version: string;
      model: string;
      checksum: string;
      downloadUrl?: string;
      sizeBytes: number;
      releaseNotes?: string;
    };
    const version = await terminalService.registerFirmwareVersion(body);
    return sendCreated(reply, version);
  });
}
