import { z } from "zod";

export const createTransferSchema = z.object({
  type: z.enum(["T2T", "S2S", "IP2IP", "WALLET", "MERCHANT", "BULK"]),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  currency: z.string().min(3).max(3).default("USD"),
  feeAmount: z.union([z.string(), z.number()]).optional().transform((v) => (v ? String(v) : "0")),
  sourceType: z.enum(["WALLET", "TERMINAL", "MERCHANT", "BANK"]),
  sourceId: z.string().min(1),
  destType: z.enum(["WALLET", "TERMINAL", "MERCHANT", "BANK"]),
  destId: z.string().min(1),
  merchantId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const bulkTransferSchema = z.object({
  currency: z.string().min(3).max(3).default("USD"),
  sourceType: z.enum(["WALLET", "MERCHANT"]),
  sourceId: z.string().min(1),
  items: z
    .array(
      z.object({
        destType: z.enum(["WALLET", "MERCHANT"]),
        destId: z.string().min(1),
        amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
        feeAmount: z.union([z.string(), z.number()]).optional().transform((v) => (v ? String(v) : "0")),
        description: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(1000, "Bulk transfer supports up to 1000 items"),
  merchantId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type BulkTransferInput = z.infer<typeof bulkTransferSchema>;
