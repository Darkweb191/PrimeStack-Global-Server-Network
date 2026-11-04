import { Prisma, type PrismaClient } from "@prisma/client";
import { connect } from "node:net";
import { FIELD_DEFS, type FieldDef } from "./iso8583.types.js";
import { logger } from "../../core/logger.js";
import { NotFoundError, ValidationError } from "../../core/errors.js";

/**
 * ISO 8583 Message Service
 *
 * Parses and builds ISO 8583 messages for terminal communication.
 * Supports both ASCII and binary encoding.
 *
 * Message structure:
 *   [MTI (4 chars)] [Primary Bitmap (16 hex chars)] [Field Data...]
 *
 * If bit 1 of the primary bitmap is set, a secondary bitmap follows
 * for fields 65-128.
 */

export class Iso8583Service {
  constructor(private prisma: PrismaClient) {}

  /**
   * Parse a hex-encoded ISO 8583 message into structured fields.
   *
   * @param hexMessage The message as a hex string
   * @param encoding Character encoding (ascii, binary)
   * @returns Parsed MTI, bitmap, and fields
   */
  parse(hexMessage: string, encoding: "ascii" | "binary" = "ascii"): {
    mti: string;
    bitmap: string;
    fields: Record<number, string>;
    fieldNames: Record<number, string>;
  } {
    let offset = 0;
    const fields: Record<number, string> = {};
    const fieldNames: Record<number, string> = {};

    // Parse MTI (field 0) — 4 chars in ASCII
    if (encoding === "ascii") {
      const mtiHex = hexMessage.substring(offset, offset + 8);
      if (mtiHex.length < 8) {
        throw new ValidationError("Message too short for MTI");
      }
      const mti = this.hexToAscii(mtiHex);
      fields[0] = mti;
      fieldNames[0] = "MTI";
      offset += 8;
    } else {
      const mtiBytes = this.hexToBytes(hexMessage.substring(offset, offset + 4));
      fields[0] = mtiBytes.join("");
      offset += 4;
    }

    // Parse primary bitmap — 8 bytes (64 bits)
    const primaryBitmapHex = hexMessage.substring(offset, offset + 16);
    if (primaryBitmapHex.length < 16) {
      throw new ValidationError("Message too short for primary bitmap");
    }

    const primaryBits = this.hexToBits(primaryBitmapHex);
    const presentFields: number[] = [];

    for (let i = 0; i < 64; i++) {
      if (primaryBits[i]) {
        // bit i+1 represents field (i+1) for the primary bitmap
        // But bit 0 (first bit) is actually field 1
        presentFields.push(i + 1);
      }
    }

    offset += 16;

    // Check if secondary bitmap is present (field 1 = bit 0 of primary bitmap)
    let bitmapHex = primaryBitmapHex;

    if (primaryBits[0]) {
      const secondaryBitmapHex = hexMessage.substring(offset, offset + 16);
      if (secondaryBitmapHex.length < 16) {
        throw new ValidationError("Message too short for secondary bitmap");
      }
      const secondaryBits = this.hexToBits(secondaryBitmapHex);

      for (let i = 0; i < 64; i++) {
        if (secondaryBits[i]) {
          presentFields.push(i + 65);
        }
      }

      offset += 16;
      bitmapHex = primaryBitmapHex + secondaryBitmapHex;
    }

    // Parse each present field
    for (const fieldNum of presentFields) {
      if (fieldNum === 1) continue; // bitmap itself, already parsed

      const def = FIELD_DEFS[fieldNum];
      if (!def) {
        logger.warn({ fieldNum }, "Unknown ISO8583 field — skipping");
        // Try to skip by reading remaining as unknown
        break;
      }

      const { value, consumed } = this.parseField(hexMessage, offset, def, encoding);
      fields[fieldNum] = value;
      fieldNames[fieldNum] = def.name;
      offset += consumed;
    }

    logger.debug({ mti: fields[0], fieldCount: Object.keys(fields).length - 1 }, "ISO8583 message parsed");

    return {
      mti: fields[0],
      bitmap: bitmapHex,
      fields,
      fieldNames,
    };
  }

  /**
   * Build an ISO 8583 message from MTI and field data.
   *
   * @param mti Message Type Indicator (4 chars)
   * @param fields Map of field number to value
   * @param encoding Character encoding
   * @returns Hex-encoded message string
   */
  build(
    mti: string,
    fields: Record<string, string>,
    encoding: "ascii" | "binary" = "ascii",
  ): string {
    if (mti.length !== 4) {
      throw new ValidationError("MTI must be 4 characters");
    }

    // Determine which fields are present (1-128)
    const fieldNumbers = Object.keys(fields)
      .map(Number)
      .filter((n) => n >= 2 && n <= 128)
      .sort((a, b) => a - b);

    // Build bitmap
    const hasSecondary = fieldNumbers.some((n) => n > 64);
    const bitmap = this.buildBitmap(fieldNumbers, hasSecondary);

    // Build the message
    let message = this.asciiToHex(mti);
    message += bitmap;

    for (const num of fieldNumbers) {
      const def = FIELD_DEFS[num];
      if (!def) {
        logger.warn({ fieldNum: num }, "Unknown ISO8583 field — skipping in build");
        continue;
      }

      message += this.buildField(fields[String(num)], def, encoding);
    }

    logger.debug({ mti, fieldCount: fieldNumbers.length }, "ISO8583 message built");
    return message;
  }

  /**
   * Record a message trace for debugging and auditing.
   */
  async recordTrace(trace: {
    traceId?: string;
    hostConnectionId?: string;
    packagerId?: string;
    direction: string;
    mti?: string;
    bitmap?: string;
    fields?: Record<string, unknown>;
    rawMessage?: Buffer;
    size?: number;
    duration?: number;
    status?: string;
    error?: string;
  }) {
    return this.prisma.messageTrace.create({
      data: {
        traceId: trace.traceId ?? `TRC-${Date.now()}`,
        hostConnectionId: trace.hostConnectionId,
        packagerId: trace.packagerId,
        direction: trace.direction,
        mti: trace.mti,
        bitmap: trace.bitmap,
        fields: trace.fields as Prisma.InputJsonValue | undefined,
        rawMessage: trace.rawMessage ?? undefined,
        size: trace.size,
        duration: trace.duration,
        status: trace.status ?? "PROCESSED",
        error: trace.error,
      },
    });
  }

  async listTraces(filters: {
    hostConnectionId?: string;
    direction?: string;
    mti?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.MessageTraceWhereInput = {};
    if (filters.hostConnectionId) where.hostConnectionId = filters.hostConnectionId;
    if (filters.direction) where.direction = filters.direction;
    if (filters.mti) where.mti = filters.mti;

    const [traces, total] = await Promise.all([
      this.prisma.messageTrace.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.messageTrace.count({ where }),
    ]);

    return {
      data: traces,
      meta: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  // ── Host Connection Management ──────────────────

  async createHostConnection(input: {
    name: string;
    protocol: string;
    host: string;
    port: number;
    timeout: number;
    retries: number;
    keepAlive: boolean;
    config?: Record<string, unknown>;
  }) {
    return this.prisma.hostConnection.create({
      data: {
        name: input.name,
        protocol: input.protocol as never,
        host: input.host,
        port: input.port,
        timeout: input.timeout,
        retries: input.retries,
        keepAlive: input.keepAlive,
        config: input.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listHostConnections() {
    return this.prisma.hostConnection.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async getHostConnection(id: string) {
    return this.prisma.hostConnection.findUnique({ where: { id } });
  }

  async testHostConnection(id: string): Promise<{
    id: string;
    reachable: boolean;
    status: "CONNECTED" | "ERROR";
    latencyMs: number;
    message: string;
  }> {
    const hostConnection = await this.prisma.hostConnection.findUnique({ where: { id } });
    if (!hostConnection) throw new NotFoundError("Bank connection", id);

    const startedAt = Date.now();
    let failure: Error | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: hostConnection.host, port: hostConnection.port });
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error("Connection timed out"));
        }, Math.min(hostConnection.timeout, 15000));

        socket.once("connect", () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    const status = failure ? "ERROR" : "CONNECTED";
    await this.prisma.hostConnection.update({
      where: { id },
      data: {
        status,
        lastError: failure ? failure.message.slice(0, 250) : null,
        lastConnectedAt: failure ? undefined : new Date(),
      },
    });

    return {
      id,
      reachable: !failure,
      status,
      latencyMs: Date.now() - startedAt,
      message: failure ? failure.message : "TCP connection established; no payment or ISO 8583 message was sent.",
    };
  }

  async updateHostConnectionStatus(id: string, status: string, error?: string) {
    return this.prisma.hostConnection.update({
      where: { id },
      data: {
        status: status as never,
        lastError: error,
        lastConnectedAt: status === "CONNECTED" ? new Date() : undefined,
      },
    });
  }

  // ── Private Helpers ──────────────────────────────

  private parseField(
    hexMessage: string,
    offset: number,
    def: FieldDef,
    encoding: "ascii" | "binary",
  ): { value: string; consumed: number } {
    let length = 0;
    let lengthHex = 0;

    if (def.lengthType === "fixed") {
      length = def.maxLength;
      // For ASCII, each byte is 2 hex chars
      lengthHex = encoding === "ascii" ? length * 2 : length;
    } else if (def.lengthType === "llvar") {
      // 2-digit length prefix in ASCII
      const lenStr = this.hexToAscii(hexMessage.substring(offset, offset + 4));
      length = parseInt(lenStr, 10);
      if (isNaN(length)) {
        throw new ValidationError(`Invalid LLVAR length for field ${def.num}: ${lenStr}`);
      }
      lengthHex = 4 + length * 2;
    } else if (def.lengthType === "lllvar") {
      // 3-digit length prefix in ASCII
      const lenStr = this.hexToAscii(hexMessage.substring(offset, offset + 6));
      length = parseInt(lenStr, 10);
      if (isNaN(length)) {
        throw new ValidationError(`Invalid LLLVAR length for field ${def.num}: ${lenStr}`);
      }
      lengthHex = 6 + length * 2;
    }

    const dataHex = hexMessage.substring(offset, offset + lengthHex);
    const value = encoding === "ascii" ? this.hexToAscii(dataHex) : dataHex;

    return { value, consumed: lengthHex };
  }

  private buildField(
    value: string,
    def: FieldDef,
    encoding: "ascii" | "binary",
  ): string {
    if (def.lengthType === "fixed") {
      // Pad to maxLength if needed
      const padded = value.padEnd(def.maxLength, "0").substring(0, def.maxLength);
      return this.asciiToHex(padded);
    } else if (def.lengthType === "llvar") {
      const length = value.length.toString().padStart(2, "0");
      return this.asciiToHex(length) + this.asciiToHex(value.substring(0, def.maxLength));
    } else {
      const length = value.length.toString().padStart(3, "0");
      return this.asciiToHex(length) + this.asciiToHex(value.substring(0, def.maxLength));
    }
  }

  private buildBitmap(fieldNumbers: number[], hasSecondary: boolean): string {
    const totalBits = hasSecondary ? 128 : 64;
    const bits = new Array(totalBits).fill(0);

    if (hasSecondary) {
      bits[0] = 1; // set bit 1 to indicate secondary bitmap
    }

    for (const num of fieldNumbers) {
      // field N corresponds to bit (N-1) in the bitmap
      if (num <= 64) {
        bits[num - 1] = 1;
      } else {
        // secondary bitmap: field 65 = bit 0 of secondary (bit 64 overall)
        bits[num - 1] = 1;
      }
    }

    // Convert bits to hex
    const totalBytes = totalBits / 8;
    const bytes: number[] = [];

    for (let i = 0; i < totalBytes; i++) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | bits[i * 8 + j];
      }
      bytes.push(byte);
    }

    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  private hexToAscii(hex: string): string {
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, i + 2), 16);
      result += String.fromCharCode(code);
    }
    return result;
  }

  private asciiToHex(str: string): string {
    return str
      .split("")
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  private hexToBits(hex: string): number[] {
    const bits: number[] = [];
    for (let i = 0; i < hex.length; i++) {
      const nibble = parseInt(hex[i], 16);
      bits.push((nibble >> 3) & 1);
      bits.push((nibble >> 2) & 1);
      bits.push((nibble >> 1) & 1);
      bits.push(nibble & 1);
    }
    return bits;
  }

  private hexToBytes(hex: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
  }
}
