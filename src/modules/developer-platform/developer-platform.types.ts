import { z } from "zod";

const appType = z.enum([
  "MERCHANT_APP",
  "TERMINAL_APP",
  "WALLET_APP",
  "TREASURY_APP",
  "PARTNER_APP",
]);

export const createApplicationSchema = z.object({
  appName: z.string().trim().min(1).max(255),
  ownerId: z.string().uuid(),
  appType,
  ratePlanId: z.string().uuid().optional(),
  productIds: z.array(z.string().uuid()).max(50).default([]),
});

export const updateApplicationSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "BLOCKED"]),
  ratePlanId: z.string().uuid().nullable().optional(),
  productIds: z.array(z.string().uuid()).max(50).optional(),
});

export const createProductSchema = z.object({
  productName: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  active: z.boolean().default(true),
});

export const createRatePlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
  requestsPerMinute: z
    .number()
    .int()
    .positive()
    .max(2147483647)
    .nullable()
    .optional(),
  dailyLimit: z.number().int().positive().max(2147483647).nullable().optional(),
});

export const createWebhookSchema = z.object({
  eventName: z.enum([
    "TRANSFER_APPROVED",
    "TRANSFER_FAILED",
    "WALLET_CREDITED",
    "SETTLEMENT_COMPLETED",
    "TERMINAL_ONLINE",
    "TERMINAL_OFFLINE",
  ]),
  callbackUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Webhook callback URL must use HTTPS"),
});

export const createSdkVersionSchema = z.object({
  sdkName: z.string().trim().min(1).max(100),
  language: z.enum(["NodeJS", "Java", "Go", "Python", ".NET", "PHP"]),
  version: z.string().trim().min(1).max(20),
});

export const createPartnerSchema = z.object({
  partnerName: z.string().trim().min(1).max(255),
  partnerType: z.enum([
    "BANK",
    "PROCESSOR",
    "AGGREGATOR",
    "MERCHANT",
    "TREASURY",
    "NETWORK",
  ]),
  active: z.boolean().default(true),
});

export const createCertificationSchema = z.object({
  applicationId: z.string().uuid(),
  certificationType: z.enum([
    "API_CERTIFICATION",
    "TERMINAL_CERTIFICATION",
    "MERCHANT_CERTIFICATION",
    "INTEGRATION_CERTIFICATION",
  ]),
});

export const updateCertificationSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "CERTIFIED", "REJECTED"]),
});

export const updateActiveSchema = z.object({
  active: z.boolean(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
