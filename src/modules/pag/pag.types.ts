import { z } from "zod";

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{1,49}$/);
const decimalAmount = z.string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,21})(?:\.\d{1,8})?$/)
  .refine((value) => Number(value) >= 0, "Amount cannot be negative");
const positiveRate = z.string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/)
  .refine((value) => Number(value) > 0, "Rate must be positive");

export const createAssetSchema = z.object({
  code,
  name: z.string().trim().min(1).max(255),
  type: z.enum(["FIAT", "DIGITAL", "LOYALTY", "REWARD", "STORED_VALUE", "MERCHANT_CREDIT"]),
  precision: z.number().int().min(0).max(8),
  active: z.boolean().default(true),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const createNetworkSchema = z.object({
  networkName: z.string().trim().min(1).max(100),
  networkType: z.enum(["INTERNAL", "MERCHANT", "WALLET", "TERMINAL", "SETTLEMENT", "BANK", "PAYMENT_PROCESSOR", "DIGITAL_ASSET"]),
  status: z.enum(["ACTIVE", "INACTIVE", "DEGRADED"]).default("ACTIVE"),
});
export type CreateNetworkInput = z.infer<typeof createNetworkSchema>;

export const createAssetRouteSchema = z.object({
  sourceNetworkId: z.string().uuid(),
  destinationNetworkId: z.string().uuid(),
  assetId: z.string().uuid(),
  priority: z.number().int().min(1).max(1000).default(100),
  costPercent: z.string().trim().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/)
    .refine((value) => Number(value) <= 100, "Cost percentage cannot exceed 100")
    .default("0"),
  estimatedLatencyMs: z.number().int().min(0).max(600000).default(0),
  availabilityScore: z.number().int().min(0).max(100).default(100),
  riskScore: z.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
});
export type CreateAssetRouteInput = z.infer<typeof createAssetRouteSchema>;

export const createConversionRateSchema = z.object({
  sourceAssetId: z.string().uuid(),
  destinationAssetId: z.string().uuid(),
  rate: positiveRate,
  active: z.boolean().default(true),
}).refine((value) => value.sourceAssetId !== value.destinationAssetId, {
  path: ["destinationAssetId"],
  message: "Source and destination assets must differ",
});

export const createLiquidityPoolSchema = z.object({
  assetId: z.string().uuid(),
  networkId: z.string().uuid(),
});

export const updateLiquiditySnapshotSchema = z.object({
  availableBalance: decimalAmount,
  reservedBalance: decimalAmount,
});

export const createAssetAccountSchema = z.object({
  accountNumber: z.string().trim().min(1).max(100),
  assetId: z.string().uuid(),
  ownerId: z.string().trim().min(1).max(100),
  ownerType: z.enum(["CUSTOMER", "MERCHANT", "AGENT", "TREASURY", "NETWORK", "SYSTEM"]),
});

export const createComplianceCheckSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  assetId: z.string().uuid().optional(),
  details: z.record(z.unknown()).optional(),
});

export const resolveComplianceCheckSchema = z.object({
  result: z.enum(["CLEARED", "REJECTED", "REVIEW"]),
  details: z.record(z.unknown()).optional(),
});

export const assetRouteRequestSchema = z.object({
  sourceNetworkId: z.string().uuid(),
  destinationNetworkId: z.string().uuid(),
  assetCode: code,
  amount: decimalAmount.refine((value) => Number(value) > 0, "Amount must be positive"),
});
