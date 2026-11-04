import type { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Ledger type definitions and Zod schemas for validation.
 * The ledger is the foundation of the switch — every transfer,
 * settlement, fee, and adjustment flows through it.
 */

// ── Zod Schemas ──────────────────────────────────

export const createAccountSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  subtype: z.string().max(100).optional(),
  currency: z.string().min(3).max(3).default("USD"),
  parentId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const journalLineSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.union([z.string(), z.number()]).transform((v) => String(v)),
  credit: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export const postEntrySchema = z.object({
  reference: z.string().min(1).max(100),
  entryType: z.enum([
    "TRANSFER",
    "SETTLEMENT",
    "FEE",
    "REVERSAL",
    "ADJUSTMENT",
    "CHARGEBACK",
    "REFUND",
    "PAYOUT",
  ]),
  description: z.string().min(1).max(500),
  source: z.string().max(50).optional(),
  lines: z.array(journalLineSchema).min(2, "A journal entry requires at least 2 lines"),
  postedBy: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const reverseEntrySchema = z.object({
  reference: z.string().min(1),
  reason: z.string().min(1).max(500),
  postedBy: z.string().max(100).optional(),
});

export const holdFundsSchema = z.object({
  accountCode: z.string().min(1),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  reference: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  postedBy: z.string().max(100).optional(),
});

// ── TypeScript Types ──────────────────────────────

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type JournalLineInput = z.infer<typeof journalLineSchema>;
export type PostEntryInput = z.infer<typeof postEntrySchema>;
export type ReverseEntryInput = z.infer<typeof reverseEntrySchema>;
export type HoldFundsInput = z.infer<typeof holdFundsSchema>;

export interface AccountBalance {
  accountCode: string;
  balance: string;
  heldBalance: string;
  availableBalance: string;
  currency: string;
  status: string;
}

export interface JournalEntryWithLines extends Prisma.JournalEntryGetPayload<{
  include: { lines: { include: { account: true } } };
}> {}
