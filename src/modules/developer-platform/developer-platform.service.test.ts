import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ConflictError, ValidationError } from "../../core/errors.js";
import { DeveloperPlatformService } from "./developer-platform.service.js";

function createPrismaMock(status = "ACTIVE") {
  const keys: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const tx = {
    developerApplication: {
      findUnique: vi.fn(async () => ({ id: "application-1", status })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "application-1",
        status: data.status,
      })),
      findUniqueOrThrow: vi.fn(async () => ({ id: "application-1", status })),
    },
    developerApplicationKey: {
      findFirst: vi.fn(
        async ({ where }: { where: { keyId?: string; active?: boolean } }) =>
          keys.find(
            (key) =>
              (!where.keyId || key.keyId === where.keyId) &&
              (where.active === undefined || key.active === where.active),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = {
          id: `key-${++sequence}`,
          ...data,
          active: true,
          createdAt: new Date(),
          revokedAt: null,
        };
        keys.push(key);
        return {
          id: key.id,
          keyId: data.keyId,
          secretLast4: data.secretLast4,
          createdAt: key.createdAt,
        };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const key = keys.find((item) => item.id === where.id);
          if (!key) throw new Error("Mock key not found");
          Object.assign(key, data);
          return key;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { applicationId: string; active: boolean };
          data: Record<string, unknown>;
        }) => {
          const matched = keys.filter(
            (key) =>
              key.applicationId === where.applicationId &&
              key.active === where.active,
          );
          for (const key of matched) Object.assign(key, data);
          return { count: matched.length };
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { prisma: prisma as unknown as PrismaClient, keys };
}

describe("DeveloperPlatformService application credentials", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: DeveloperPlatformService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DeveloperPlatformService(prisma.prisma);
  });

  it("returns a one-time secret while persisting only its hash", async () => {
    const result = await service.createApplicationKey("application-1");

    expect(result.secret).toMatch(/^dps_[a-f0-9]{64}$/);
    expect(prisma.keys[0].secretHash).toBe(
      createHash("sha256").update(result.secret).digest("hex"),
    );
    expect(result).not.toHaveProperty("secretHash");
  });

  it("replaces the active key during rotation", async () => {
    const first = await service.createApplicationKey("application-1");
    const second = await service.rotateApplicationKey(
      "application-1",
      first.keyId,
    );

    expect(prisma.keys).toHaveLength(2);
    expect(prisma.keys[0].active).toBe(false);
    expect(prisma.keys[0].revokedAt).toBeInstanceOf(Date);
    expect(prisma.keys[1].active).toBe(true);
    expect(second.keyId).not.toBe(first.keyId);
  });

  it("refuses a second active key without rotating", async () => {
    await service.createApplicationKey("application-1");

    await expect(
      service.createApplicationKey("application-1"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.keys).toHaveLength(1);
  });

  it("does not issue credentials for a pending application", async () => {
    const pending = createPrismaMock("PENDING");
    const pendingService = new DeveloperPlatformService(pending.prisma);

    await expect(
      pendingService.createApplicationKey("application-1"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(pending.keys).toHaveLength(0);
  });

  it("revokes active credentials when an application is suspended", async () => {
    const key = await service.createApplicationKey("application-1");

    await service.updateApplication("application-1", { status: "SUSPENDED" });

    expect(prisma.keys[0].active).toBe(false);
    expect(prisma.keys[0].revokedAt).toBeInstanceOf(Date);
    expect(key.keyId).toBe(prisma.keys[0].keyId);
  });
});
