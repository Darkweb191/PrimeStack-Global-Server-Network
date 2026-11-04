import { z } from "zod";

export const createWalletSchema = z.object({
  walletAddress: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Wallet address must be alphanumeric"),
  label: z.string().max(100).optional(),
  type: z.enum([
    "CUSTOMER",
    "MERCHANT",
    "AGENT",
    "TREASURY",
    "ESCROW",
    "RESERVE",
    "SETTLEMENT",
    "USER",
    "PAYOUT",
  ]),
  merchantId: z.string().uuid().optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code")
    .transform((value) => value.toUpperCase())
    .default("USD"),
  preferredLang: z.string().min(2).max(5).default("en"),
  initialBalance: z.union([z.string(), z.number()]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateWalletSchema = z.object({
  label: z.string().max(100).optional(),
  preferredLang: z.string().min(2).max(5).optional(),
  status: z.enum(["ACTIVE", "FROZEN", "CLOSED"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;

export interface WalletBalance {
  walletAddress: string;
  type: string;
  currency: string;
  balance: string;
  heldBalance: string;
  availableBalance: string;
  status: string;
}
