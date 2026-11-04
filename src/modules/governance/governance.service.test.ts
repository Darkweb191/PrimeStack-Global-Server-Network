import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ValidationError } from "../../core/errors.js";
import { GovernanceService } from "./governance.service.js";

function createPrismaMock() {
  const key = {
    id: "key-1",
    keyVersion: 1,
    purpose: "JWT signing",
    status: "GENERATED",
    updatedBy: null as string | null,
    activatedAt: null as Date | null,
    retiredAt: null as Date | null,
  };
  const change = {
    id: "change-1",
    requestedBy: "requester-1",
    reviewedBy: null as string | null,
    approvedBy: null as string | null,
    implementedBy: null as string | null,
    verifiedBy: null as string | null,
    approvalStatus: "REQUESTED",
  };
  const prisma = {
    governanceKeyRecord: {
      findUnique: vi.fn(async () => ({ ...key })),
      update: vi.fn(async ({ data }: { data: Partial<typeof key> }) => {
        Object.assign(key, data);
        return { ...key };
      }),
    },
    governanceChangeRequest: {
      findUnique: vi.fn(async () => ({ ...change })),
      update: vi.fn(async ({ data }: { data: Partial<typeof change> }) => {
        Object.assign(change, data);
        return { ...change };
      }),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, key, change };
}

describe("GovernanceService workflows", () => {
  let mock: ReturnType<typeof createPrismaMock>;
  let service: GovernanceService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new GovernanceService(mock.prisma);
  });

  it("advances key metadata and records activation without storing key material", async () => {
    const active = await service.updateKeyRecord(
      "key-1",
      { status: "ACTIVE" },
      "admin-1",
    );

    expect(active.status).toBe("ACTIVE");
    expect(active.activatedAt).toBeInstanceOf(Date);
    expect(active).not.toHaveProperty("secret");
    expect(active).not.toHaveProperty("keyMaterial");
  });

  it("rejects skipped key lifecycle states", async () => {
    await expect(
      service.updateKeyRecord("key-1", { status: "DESTROYED" }, "admin-1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires a different user to approve a change request", async () => {
    mock.change.approvalStatus = "REVIEWED";
    await expect(
      service.updateChangeRequest(
        "change-1",
        { approvalStatus: "APPROVED" },
        "requester-1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces sequential change-request status transitions", async () => {
    await expect(
      service.updateChangeRequest(
        "change-1",
        { approvalStatus: "APPROVED" },
        "reviewer-1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records the approving user when a different actor approves", async () => {
    mock.change.approvalStatus = "REVIEWED";
    const approved = await service.updateChangeRequest(
      "change-1",
      { approvalStatus: "APPROVED" },
      "approver-1",
    );

    expect(approved.approvalStatus).toBe("APPROVED");
    expect(approved.approvedBy).toBe("approver-1");
  });
});
