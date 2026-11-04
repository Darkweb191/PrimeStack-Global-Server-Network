import { z } from "zod";

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const optionalNotes = z.string().trim().max(4000).optional();

export const createRiskSchema = z.object({
  riskCategory: z.enum([
    "OPERATIONAL",
    "SECURITY",
    "LIQUIDITY",
    "COMPLIANCE",
    "TECHNOLOGY",
    "VENDOR",
  ]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  likelihood: z.enum([
    "RARE",
    "UNLIKELY",
    "POSSIBLE",
    "LIKELY",
    "ALMOST_CERTAIN",
  ]),
  description: nonEmpty(4000),
  mitigation: nonEmpty(4000),
  ownerId: z.string().uuid().optional(),
});

export const updateRiskSchema = z.object({
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  likelihood: z
    .enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"])
    .optional(),
  description: nonEmpty(4000).optional(),
  mitigation: nonEmpty(4000).optional(),
  status: z.enum(["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"]).optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

export const createDrPlanSchema = z.object({
  serviceName: nonEmpty(100),
  rtoMinutes: z.number().int().min(0).max(525600),
  rpoMinutes: z.number().int().min(0).max(525600),
  planReference: z.string().trim().max(500).optional(),
});

export const updateDrPlanSchema = z.object({
  rtoMinutes: z.number().int().min(0).max(525600).optional(),
  rpoMinutes: z.number().int().min(0).max(525600).optional(),
  planReference: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["DRAFT", "REVIEWED", "APPROVED", "TESTED"]).optional(),
});

export const createBackupRecordSchema = z.object({
  backupType: z.enum(["FULL", "INCREMENTAL", "CONTINUOUS"]),
  backupDate: z.coerce.date(),
  status: z.enum(["SCHEDULED", "SUCCEEDED", "FAILED", "VERIFIED"]),
  locationReference: z.string().trim().max(500).optional(),
  notes: optionalNotes,
});

export const updateBackupRecordSchema = z.object({
  status: z.enum(["SCHEDULED", "SUCCEEDED", "FAILED", "VERIFIED"]),
  locationReference: z.string().trim().max(500).nullable().optional(),
  notes: optionalNotes,
});

export const createKeyRecordSchema = z.object({
  keyVersion: z.number().int().positive().max(2147483647),
  purpose: nonEmpty(100),
});

export const updateKeyRecordSchema = z.object({
  status: z.enum(["GENERATED", "ACTIVE", "ROTATING", "RETIRED", "DESTROYED"]),
});

export const createRetentionPolicySchema = z.object({
  policyName: nonEmpty(100),
  retentionDays: z.number().int().min(1).max(36500),
  dataCategory: nonEmpty(100),
  description: z.string().trim().max(2000).optional(),
});

export const updateRetentionPolicySchema = z.object({
  retentionDays: z.number().int().min(1).max(36500).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

export const createChangeRequestSchema = z.object({
  title: nonEmpty(255),
  description: nonEmpty(4000),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export const updateChangeRequestSchema = z.object({
  approvalStatus: z.enum(["REVIEWED", "APPROVED", "IMPLEMENTED", "VERIFIED"]),
});

export const createRegulatoryReportSchema = z.object({
  reportType: nonEmpty(100),
  reportingPeriod: z.coerce.date(),
  artifactReference: z.string().trim().max(500).optional(),
});

export const updateRegulatoryReportSchema = z.object({
  status: z.enum(["PLANNED", "GENERATED", "SUBMITTED", "ACCEPTED", "REJECTED"]),
  generatedAt: z.coerce.date().optional(),
  artifactReference: z.string().trim().max(500).nullable().optional(),
});

export const createVendorSchema = z.object({
  vendorName: nonEmpty(255),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  notes: optionalNotes,
});

export const updateVendorSchema = z.object({
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z
    .enum(["ACTIVE", "UNDER_REVIEW", "SUSPENDED", "TERMINATED"])
    .optional(),
  notes: optionalNotes,
});

export const createContinuityTestSchema = z.object({
  scenario: nonEmpty(255),
  testDate: z.coerce.date(),
  result: z.enum(["PLANNED", "PASSED", "FAILED", "PARTIAL"]),
  notes: optionalNotes,
});
