import { Prisma, type PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import type {
  RegisterTerminalInput,
  UpdateTerminalInput,
  UpdateHealthInput,
  RemoteCommandInput,
} from "./types.js";

/**
 * Terminal Service
 *
 * Manages the lifecycle of payment terminals:
 *   - Registration and provisioning
 *   - Health monitoring (heartbeats, resource usage)
 *   - Remote commands (reboot, config push, key injection)
 *   - EMV parameter management
 *   - Firmware versioning
 */
export class TerminalService {
  constructor(private prisma: PrismaClient) {}

  // ── Terminal CRUD ────────────────────────────────

  async registerTerminal(input: RegisterTerminalInput) {
    // Check for duplicate TID or serial number
    const existing = await this.prisma.terminal.findFirst({
      where: {
        OR: [{ tid: input.tid }, { serialNumber: input.serialNumber }],
      },
    });
    if (existing) {
      throw new ConflictError("Terminal with this TID or serial number already exists");
    }

    // Verify merchant exists
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: input.merchantId },
    });
    if (!merchant) {
      throw new NotFoundError("Merchant", input.merchantId);
    }

    const terminal = await this.prisma.terminal.create({
      data: {
        tid: input.tid,
        mid: input.mid,
        serialNumber: input.serialNumber,
        merchantId: input.merchantId,
        model: input.model,
        osVersion: input.osVersion,
        firmwareVersion: input.firmwareVersion,
        location: input.location,
        city: input.city,
        country: input.country,
        timezone: input.timezone,
        status: "REGISTERED",
        config: input.config as Prisma.InputJsonValue | undefined,
      },
      include: { merchant: true },
    });

    // Create initial health record
    await this.prisma.terminalHealth.create({
      data: {
        terminalId: terminal.id,
        status: "OFFLINE",
      },
    });

    logger.info({ terminalId: terminal.id, tid: terminal.tid, merchantId: input.merchantId }, "Terminal registered");
    return terminal;
  }

  async getTerminal(id: string) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id },
      include: { merchant: true, health: true },
    });

    if (!terminal) {
      throw new NotFoundError("Terminal", id);
    }

    return terminal;
  }

  async getTerminalByTid(tid: string) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { tid },
      include: { merchant: true, health: true },
    });

    if (!terminal) {
      throw new NotFoundError("Terminal", tid);
    }

    return terminal;
  }

  async listTerminals(filters: {
    merchantId?: string;
    status?: string;
    country?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.TerminalWhereInput = {};
    if (filters.merchantId) where.merchantId = filters.merchantId;
    if (filters.status) where.status = filters.status as never;
    if (filters.country) where.country = filters.country;

    const [terminals, total] = await Promise.all([
      this.prisma.terminal.findMany({
        where,
        include: { merchant: { select: { code: true, legalName: true } }, health: true },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.terminal.count({ where }),
    ]);

    return {
      data: terminals,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  async updateTerminal(id: string, input: UpdateTerminalInput) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id } });
    if (!terminal) {
      throw new NotFoundError("Terminal", id);
    }

    const updated = await this.prisma.terminal.update({
      where: { id },
      data: {
        model: input.model,
        osVersion: input.osVersion,
        firmwareVersion: input.firmwareVersion,
        location: input.location,
        city: input.city,
        country: input.country,
        timezone: input.timezone,
        status: input.status as never,
        config: input.config as Prisma.InputJsonValue | undefined,
        ...(input.status === "DECOMMISSIONED" ? { deactivatedAt: new Date() } : {}),
      },
      include: { merchant: true },
    });

    logger.info({ terminalId: id, status: input.status }, "Terminal updated");
    return updated;
  }

  async deleteTerminal(id: string) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id } });
    if (!terminal) {
      throw new NotFoundError("Terminal", id);
    }

    // Soft delete — decommission instead of hard delete
    await this.prisma.terminal.update({
      where: { id },
      data: {
        status: "DECOMMISSIONED",
        deactivatedAt: new Date(),
      },
    });

    logger.info({ terminalId: id }, "Terminal decommissioned");
    return { id, status: "DECOMMISSIONED" };
  }

  // ── Terminal Health ──────────────────────────────

  async updateHealth(terminalId: string, input: UpdateHealthInput) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
    });
    if (!terminal) {
      throw new NotFoundError("Terminal", terminalId);
    }

    // Upsert health record
    const health = await this.prisma.terminalHealth.upsert({
      where: { terminalId },
      update: {
        status: input.status as never,
        heartbeatAt: new Date(),
        cpuUsage: input.cpuUsage,
        memoryUsage: input.memoryUsage,
        diskUsage: input.diskUsage,
        temperature: input.temperature,
        batteryLevel: input.batteryLevel,
        networkLatencyMs: input.networkLatencyMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        lastCheckedAt: new Date(),
      },
      create: {
        terminalId,
        status: input.status as never,
        heartbeatAt: new Date(),
        cpuUsage: input.cpuUsage,
        memoryUsage: input.memoryUsage,
        diskUsage: input.diskUsage,
        temperature: input.temperature,
        batteryLevel: input.batteryLevel,
        networkLatencyMs: input.networkLatencyMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        lastCheckedAt: new Date(),
      },
    });

    // Update terminal's lastSeenAt
    await this.prisma.terminal.update({
      where: { id: terminalId },
      data: { lastSeenAt: new Date() },
    });

    logger.debug({ terminalId, status: input.status }, "Terminal health updated");
    return health;
  }

  async getHealth(terminalId: string) {
    const health = await this.prisma.terminalHealth.findUnique({
      where: { terminalId },
    });

    if (!health) {
      throw new NotFoundError("Terminal health", terminalId);
    }

    return health;
  }

  async listTerminalsByStatus(status: string) {
    return this.prisma.terminal.findMany({
      where: { status: status as never },
      include: { health: true, merchant: { select: { code: true, legalName: true } } },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  // ── Remote Commands ──────────────────────────────

  async sendCommand(input: RemoteCommandInput) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: input.terminalId },
    });
    if (!terminal) {
      throw new NotFoundError("Terminal", input.terminalId);
    }

    const command = await this.prisma.remoteCommand.create({
      data: {
        terminalId: input.terminalId,
        command: input.command,
        payload: input.payload as Prisma.InputJsonValue | undefined,
        status: "PENDING",
        expiresAt: new Date(Date.now() + input.expiresInMinutes * 60 * 1000),
      },
    });

    logger.info({ terminalId: input.terminalId, command: input.command, commandId: command.id }, "Remote command queued");
    return command;
  }

  async getPendingCommands(terminalId: string) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
    });
    if (!terminal) {
      throw new NotFoundError("Terminal", terminalId);
    }

    return this.prisma.remoteCommand.findMany({
      where: {
        terminalId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async ackCommand(commandId: string) {
    const command = await this.prisma.remoteCommand.findUnique({
      where: { id: commandId },
    });
    if (!command) {
      throw new NotFoundError("Remote command", commandId);
    }

    return this.prisma.remoteCommand.update({
      where: { id: commandId },
      data: {
        status: "ACK",
        ackedAt: new Date(),
        sentAt: command.sentAt ?? new Date(),
      },
    });
  }

  // ── EMV Parameters ──────────────────────────────

  async setEmvParameter(terminalId: string, aid: string, label: string, version?: string, config?: Record<string, unknown>) {
    return this.prisma.emvParameter.upsert({
      where: { terminalId_aid: { terminalId, aid } },
      update: {
        label,
        version,
        config: config as Prisma.InputJsonValue | undefined,
      },
      create: {
        terminalId,
        aid,
        label,
        version,
        config: config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async getEmvParameters(terminalId: string) {
    return this.prisma.emvParameter.findMany({
      where: { terminalId },
    });
  }

  // ── Firmware Management ─────────────────────────

  async registerFirmwareVersion(input: {
    version: string;
    model: string;
    checksum: string;
    downloadUrl?: string;
    sizeBytes: number;
    releaseNotes?: string;
  }) {
    return this.prisma.firmwareVersion.create({
      data: {
        version: input.version,
        model: input.model,
        checksum: input.checksum,
        downloadUrl: input.downloadUrl,
        sizeBytes: input.sizeBytes,
        releaseNotes: input.releaseNotes,
      },
    });
  }

  async listFirmwareVersions(model?: string) {
    const where: Prisma.FirmwareVersionWhereInput = {};
    if (model) where.model = model;

    return this.prisma.firmwareVersion.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }
}
