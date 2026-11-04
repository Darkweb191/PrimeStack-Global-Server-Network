import { z } from "zod";

export const createMerchantSchema = z.object({
  code: z.string().min(3).max(50).regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric"),
  legalName: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  dbaName: z.string().max(255).optional(),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  country: z.string().min(2).max(3).default("US"),
  preferredLang: z.string().min(2).max(5).default("en"),
  mcc: z.string().max(4).optional(),
  merchantCategory: z.string().max(50).optional(),
  website: z.string().url().optional(),
  taxId: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateMerchantSchema = z.object({
  legalName: z.string().min(1).max(255).optional(),
  displayName: z.string().max(255).optional(),
  dbaName: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  preferredLang: z.string().min(2).max(5).optional(),
  mcc: z.string().max(4).optional(),
  website: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const money = z.union([z.string(), z.number()]).transform((value) => String(value));
const currency = z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());

export const createMidSchema = z.object({
  mid: z.string().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),
  label: z.string().max(100).optional(),
});

export const createKycDocumentSchema = z.object({
  documentType: z.enum([
    "TRADE_LICENSE",
    "PASSPORT",
    "NATIONAL_ID",
    "BANK_LETTER",
    "ADDRESS_PROOF",
    "ARTICLES_OF_INCORPORATION",
    "OTHER",
  ]),
  documentReference: z.string().min(1).max(255),
});

export const reviewKycDocumentSchema = z.object({
  verificationStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  reviewedBy: z.string().max(100).optional(),
});

export const merchantRiskProfileSchema = z.object({
  dailyLimit: money.optional(),
  monthlyLimit: money.optional(),
  chargebackLimit: money.optional(),
  riskScore: z.preprocess(
    (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    z.number().int().min(0).max(100),
  ),
});

export const createPricingPlanSchema = z.object({
  planName: z.string().min(1).max(100),
  transactionFee: money,
  settlementFee: money,
  payoutFee: money,
  currency,
});

export const createMerchantInvoiceSchema = z.object({
  amount: money,
  currency: currency.default("USD"),
  description: z.string().max(500).optional(),
  dueAt: z.string().datetime().optional(),
});

export const createPaymentLinkSchema = z.object({
  amount: money,
  currency: currency.default("USD"),
  description: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const assignMerchantWalletSchema = z.object({
  walletId: z.string().uuid(),
  settlementAccountId: z.string().uuid().optional(),
});

export const createAgentSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1).max(255),
  commissionRate: money,
  parentAgentId: z.string().uuid().optional(),
});

export const assignAgentSchema = z.object({
  agentId: z.string().uuid().nullable(),
});

export const updateMerchantStatusSchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "ACTIVE", "SUSPENDED", "BLOCKED", "TERMINATED"]),
});

export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;
export type UpdateMerchantInput = z.infer<typeof updateMerchantSchema>;
