import type { PrismaClient } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.js";
import type {
  createBackupRecordSchema,
  createChangeRequestSchema,
  createContinuityTestSchema,
  createDrPlanSchema,
  createKeyRecordSchema,
  createRegulatoryReportSchema,
  createRetentionPolicySchema,
  createRiskSchema,
  createVendorSchema,
  updateBackupRecordSchema,
  updateChangeRequestSchema,
  updateDrPlanSchema,
  updateKeyRecordSchema,
  updateRegulatoryReportSchema,
  updateRetentionPolicySchema,
  updateRiskSchema,
  updateVendorSchema,
} from "./governance.types.js";
import type { z } from "zod";

type CreateRiskInput = z.infer<typeof createRiskSchema>;
type UpdateRiskInput = z.infer<typeof updateRiskSchema>;
type CreateDrPlanInput = z.infer<typeof createDrPlanSchema>;
type UpdateDrPlanInput = z.infer<typeof updateDrPlanSchema>;
type CreateBackupInput = z.infer<typeof createBackupRecordSchema>;
type UpdateBackupInput = z.infer<typeof updateBackupRecordSchema>;
type CreateKeyInput = z.infer<typeof createKeyRecordSchema>;
type UpdateKeyInput = z.infer<typeof updateKeyRecordSchema>;
type CreatePolicyInput = z.infer<typeof createRetentionPolicySchema>;
type UpdatePolicyInput = z.infer<typeof updateRetentionPolicySchema>;
type CreateChangeInput = z.infer<typeof createChangeRequestSchema>;
type UpdateChangeInput = z.infer<typeof updateChangeRequestSchema>;
type CreateReportInput = z.infer<typeof createRegulatoryReportSchema>;
type UpdateReportInput = z.infer<typeof updateRegulatoryReportSchema>;
type CreateVendorInput = z.infer<typeof createVendorSchema>;
type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
type CreateTestInput = z.infer<typeof createContinuityTestSchema>;

export class GovernanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard() {
    const [
      openRisks,
      drPlanCount,
      backupFailures,
      activeKeyRecords,
      activePolicies,
      pendingChanges,
      pendingReports,
      activeVendors,
      risks,
      drPlans,
      backups,
      keys,
      retentionPolicies,
      changeRequests,
      regulatoryReports,
      vendors,
      continuityTests,
    ] = await Promise.all([
      this.prisma.enterpriseRisk.count({
        where: { status: { not: "CLOSED" } },
      }),
      this.prisma.disasterRecoveryPlan.count(),
      this.prisma.governanceBackupRecord.count({ where: { status: "FAILED" } }),
      this.prisma.governanceKeyRecord.count({ where: { status: "ACTIVE" } }),
      this.prisma.dataRetentionPolicy.count({ where: { active: true } }),
      this.prisma.governanceChangeRequest.count({
        where: { approvalStatus: { not: "VERIFIED" } },
      }),
      this.prisma.regulatoryReportRecord.count({
        where: { status: "PLANNED" },
      }),
      this.prisma.governanceVendor.count({ where: { status: "ACTIVE" } }),
      this.listRisks(),
      this.listDrPlans(),
      this.listBackups(),
      this.listKeyRecords(),
      this.listRetentionPolicies(),
      this.listChangeRequests(),
      this.listRegulatoryReports(),
      this.listVendors(),
      this.listContinuityTests(),
    ]);
    return {
      summary: {
        openRisks,
        drPlans: drPlanCount,
        backupFailures,
        activeKeyRecords,
        activePolicies,
        pendingChanges,
        pendingReports,
        activeVendors,
        continuityTests: continuityTests.length,
      },
      risks,
      drPlans,
      backups,
      keys,
      retentionPolicies,
      changeRequests,
      regulatoryReports,
      vendors,
      continuityTests,
    };
  }

  async listRisks() {
    return this.prisma.enterpriseRisk.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  }

  async createRisk(input: CreateRiskInput, actorId: string) {
    return this.prisma.enterpriseRisk.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateRisk(id: string, input: UpdateRiskInput, actorId: string) {
    await this.ensureExists(
      this.prisma.enterpriseRisk.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Enterprise risk",
      id,
    );
    return this.prisma.enterpriseRisk.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listDrPlans() {
    return this.prisma.disasterRecoveryPlan.findMany({
      orderBy: { serviceName: "asc" },
      take: 200,
    });
  }

  async createDrPlan(input: CreateDrPlanInput, actorId: string) {
    if (
      await this.prisma.disasterRecoveryPlan.findUnique({
        where: { serviceName: input.serviceName },
      })
    ) {
      throw new ConflictError(
        "A disaster-recovery plan already exists for this service",
      );
    }
    return this.prisma.disasterRecoveryPlan.create({
      data: {
        ...input,
        status: "DRAFT",
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async updateDrPlan(id: string, input: UpdateDrPlanInput, actorId: string) {
    await this.ensureExists(
      this.prisma.disasterRecoveryPlan.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Disaster-recovery plan",
      id,
    );
    return this.prisma.disasterRecoveryPlan.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listBackups() {
    return this.prisma.governanceBackupRecord.findMany({
      orderBy: { backupDate: "desc" },
      take: 200,
    });
  }

  async createBackup(input: CreateBackupInput, actorId: string) {
    return this.prisma.governanceBackupRecord.create({
      data: { ...input, recordedBy: actorId },
    });
  }

  async updateBackup(id: string, input: UpdateBackupInput, actorId: string) {
    await this.ensureExists(
      this.prisma.governanceBackupRecord.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Backup record",
      id,
    );
    return this.prisma.governanceBackupRecord.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listKeyRecords() {
    return this.prisma.governanceKeyRecord.findMany({
      orderBy: [{ purpose: "asc" }, { keyVersion: "desc" }],
      take: 200,
    });
  }

  async createKeyRecord(input: CreateKeyInput, actorId: string) {
    const duplicate = await this.prisma.governanceKeyRecord.findFirst({
      where: { keyVersion: input.keyVersion, purpose: input.purpose },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictError(
        "Key version is already recorded for this purpose",
      );
    return this.prisma.governanceKeyRecord.create({
      data: { ...input, createdBy: actorId },
    });
  }

  async updateKeyRecord(id: string, input: UpdateKeyInput, actorId: string) {
    const current = await this.prisma.governanceKeyRecord.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundError("Key lifecycle record", id);
    const next = this.nextKeyStatuses[current.status];
    if (!next?.includes(input.status)) {
      throw new ValidationError(
        `Invalid key-record status transition from ${current.status} to ${input.status}`,
      );
    }
    const now = new Date();
    return this.prisma.governanceKeyRecord.update({
      where: { id },
      data: {
        status: input.status,
        updatedBy: actorId,
        ...(input.status === "ACTIVE" ? { activatedAt: now } : {}),
        ...(["RETIRED", "DESTROYED"].includes(input.status)
          ? { retiredAt: now }
          : {}),
      },
    });
  }

  async listRetentionPolicies() {
    return this.prisma.dataRetentionPolicy.findMany({
      orderBy: { policyName: "asc" },
      take: 200,
    });
  }

  async createRetentionPolicy(input: CreatePolicyInput, actorId: string) {
    if (
      await this.prisma.dataRetentionPolicy.findUnique({
        where: { policyName: input.policyName },
      })
    ) {
      throw new ConflictError(
        "A retention policy with this name already exists",
      );
    }
    return this.prisma.dataRetentionPolicy.create({
      data: { ...input, createdBy: actorId, updatedBy: actorId },
    });
  }

  async updateRetentionPolicy(
    id: string,
    input: UpdatePolicyInput,
    actorId: string,
  ) {
    await this.ensureExists(
      this.prisma.dataRetentionPolicy.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Data-retention policy",
      id,
    );
    return this.prisma.dataRetentionPolicy.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listChangeRequests() {
    return this.prisma.governanceChangeRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createChangeRequest(input: CreateChangeInput, actorId: string) {
    return this.prisma.governanceChangeRequest.create({
      data: { ...input, approvalStatus: "REQUESTED", requestedBy: actorId },
    });
  }

  async updateChangeRequest(
    id: string,
    input: UpdateChangeInput,
    actorId: string,
  ) {
    const current = await this.prisma.governanceChangeRequest.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundError("Change request", id);
    const nextStatus = this.nextChangeStatuses[current.approvalStatus];
    if (nextStatus !== input.approvalStatus) {
      throw new ValidationError(
        `Invalid change-request transition from ${current.approvalStatus} to ${input.approvalStatus}`,
      );
    }
    if (
      input.approvalStatus === "APPROVED" &&
      current.requestedBy === actorId
    ) {
      throw new ValidationError(
        "A change requester cannot approve their own request",
      );
    }
    return this.prisma.governanceChangeRequest.update({
      where: { id },
      data: {
        approvalStatus: input.approvalStatus,
        ...(input.approvalStatus === "REVIEWED" ? { reviewedBy: actorId } : {}),
        ...(input.approvalStatus === "APPROVED" ? { approvedBy: actorId } : {}),
        ...(input.approvalStatus === "IMPLEMENTED"
          ? { implementedBy: actorId }
          : {}),
        ...(input.approvalStatus === "VERIFIED" ? { verifiedBy: actorId } : {}),
      },
    });
  }

  async listRegulatoryReports() {
    return this.prisma.regulatoryReportRecord.findMany({
      orderBy: { reportingPeriod: "desc" },
      take: 200,
    });
  }

  async createRegulatoryReport(input: CreateReportInput, actorId: string) {
    return this.prisma.regulatoryReportRecord.create({
      data: { ...input, createdBy: actorId },
    });
  }

  async updateRegulatoryReport(
    id: string,
    input: UpdateReportInput,
    actorId: string,
  ) {
    await this.ensureExists(
      this.prisma.regulatoryReportRecord.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Regulatory report record",
      id,
    );
    return this.prisma.regulatoryReportRecord.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listVendors() {
    return this.prisma.governanceVendor.findMany({
      orderBy: { vendorName: "asc" },
      take: 200,
    });
  }

  async createVendor(input: CreateVendorInput, actorId: string) {
    if (
      await this.prisma.governanceVendor.findUnique({
        where: { vendorName: input.vendorName },
      })
    ) {
      throw new ConflictError("A vendor with this name already exists");
    }
    return this.prisma.governanceVendor.create({
      data: { ...input, createdBy: actorId },
    });
  }

  async updateVendor(id: string, input: UpdateVendorInput, actorId: string) {
    await this.ensureExists(
      this.prisma.governanceVendor.findUnique({
        where: { id },
        select: { id: true },
      }),
      "Vendor",
      id,
    );
    return this.prisma.governanceVendor.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
    });
  }

  async listContinuityTests() {
    return this.prisma.continuityTestRecord.findMany({
      orderBy: { testDate: "desc" },
      take: 200,
    });
  }

  async createContinuityTest(input: CreateTestInput, actorId: string) {
    return this.prisma.continuityTestRecord.create({
      data: { ...input, conductedBy: actorId },
    });
  }

  private readonly nextChangeStatuses: Record<string, string> = {
    REQUESTED: "REVIEWED",
    REVIEWED: "APPROVED",
    APPROVED: "IMPLEMENTED",
    IMPLEMENTED: "VERIFIED",
  };

  private readonly nextKeyStatuses: Record<string, string[]> = {
    GENERATED: ["ACTIVE"],
    ACTIVE: ["ROTATING", "RETIRED"],
    ROTATING: ["RETIRED"],
    RETIRED: ["DESTROYED"],
  };

  private async ensureExists<T>(
    value: Promise<T | null>,
    resource: string,
    id: string,
  ): Promise<T> {
    const entity = await value;
    if (!entity) throw new NotFoundError(resource, id);
    return entity;
  }
}
