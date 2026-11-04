import { z } from "zod";

/**
 * S2S Engine — Type definitions and Zod schemas
 *
 * Covers:
 *   - S2sConnection  : External server credentials + endpoint config
 *   - S2sPayment     : Incoming fund receipt events
 *   - S2sBankWithdrawal : Outbound withdrawal to external bank
 *   - S2sReceiptTemplate: JSON-driven receipt field definitions
 */

// ── Receipt Template ─────────────────────────────────────────────

/** A single field definition inside a receipt template's templateJson */
export const receiptFieldSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  /**
   * Data source path on the payment object.
   * Supports dot-notation, e.g. "metadata.orderId", "senderReference", "amount".
   */
  source: z.string().min(1).max(255),
  required: z.boolean().default(false),
  /**
   * Optional display format hint: "currency", "date", "datetime", "masked", "text"
   */
  format: z.enum(["currency", "date", "datetime", "masked", "text"]).default("text"),
});

export const templateJsonSchema = z.object({
  version: z.string().default("1.0"),
  fields: z.array(receiptFieldSchema).min(1).max(50),
  footerNote: z.string().max(500).optional(),
});

export const createReceiptTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  templateJson: templateJsonSchema,
  isDefault: z.boolean().default(false),
});

export const updateReceiptTemplateSchema = createReceiptTemplateSchema.partial();

export type ReceiptField = z.infer<typeof receiptFieldSchema>;
export type TemplateJson = z.infer<typeof templateJsonSchema>;
export type CreateReceiptTemplateInput = z.infer<typeof createReceiptTemplateSchema>;
export type UpdateReceiptTemplateInput = z.infer<typeof updateReceiptTemplateSchema>;

// ── S2S Connection ───────────────────────────────────────────────

export const createConnectionSchema = z.object({
  name: z.string().min(1).max(255),
  /**
   * The remote server's base URL. We make fund-pull HTTP calls to this.
   * Must be HTTPS in production.
   */
  endpointUrl: z.string().url("endpointUrl must be a valid URL"),
  /**
   * The HMAC secret (or API key) the remote server expects us to send.
   * Also used to verify incoming webhook calls from that server.
   */
  apiSecret: z.string().min(16).max(512),
  /**
   * HTTP header name we send the apiSecret in when calling the remote server.
   * Defaults to "x-api-key". The remote server provider chooses this.
   */
  apiKeyHeader: z.string().min(1).max(100).default("x-api-key"),
  /**
   * URL we POST receipt/confirmation data to after a payment is processed.
   */
  callbackUrl: z.string().url().optional(),
  /**
   * IP addresses allowed to make fund push calls to this switch on behalf
   * of this connection. Enforced at the route level.
   */
  allowedIps: z.array(z.string()).default([]),
  supportedCurrencies: z
    .array(z.string().min(3).max(3).toUpperCase())
    .min(1)
    .default(["USD"]),
  dailyLimitAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v: string | number | undefined) => (v !== undefined ? String(v) : undefined)),
  singleTxLimitAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v: string | number | undefined) => (v !== undefined ? String(v) : undefined)),
  receiptTemplateId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  endpointUrl: z.string().url().optional(),
  apiSecret: z.string().min(16).max(512).optional(),
  apiKeyHeader: z.string().min(1).max(100).optional(),
  callbackUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "TESTING"]).optional(),
  allowedIps: z.array(z.string()).optional(),
  supportedCurrencies: z.array(z.string().min(3).max(3).toUpperCase()).optional(),
  dailyLimitAmount: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v: string | number | null | undefined) => (v !== null && v !== undefined ? String(v) : v ?? undefined)),
  singleTxLimitAmount: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v: string | number | null | undefined) => (v !== null && v !== undefined ? String(v) : v ?? undefined)),
  receiptTemplateId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

// ── S2S Payment (Incoming Funds) ─────────────────────────────────

/**
 * Used when the remote server pushes a fund notice to us,
 * or when we pull funds from the remote server.
 */
export const createS2sPaymentSchema = z.object({
  /**
   * The registered connection ID this payment belongs to.
   */
  connectionId: z.string().uuid("connectionId must be a valid UUID"),
  amount: z.union([z.string(), z.number()]).transform((v: string | number) => String(v)),
  currency: z.string().min(3).max(3).default("USD").transform((v) => v.toUpperCase()),
  feeAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v: string | number | undefined) => (v ? String(v) : "0")),
  /**
   * The reference generated by the remote server for this transaction.
   * Stored for reconciliation.
   */
  senderReference: z.string().max(255).optional(),
  /**
   * Account identifier on the remote server (e.g. their user ID or wallet ID).
   */
  senderAccountId: z.string().max(255).optional(),
  /**
   * The wallet address in THIS switch where the funds should be credited.
   */
  receiverWalletAddr: z.string().min(1).max(255),
  /**
   * Which receipt template to use for this payment.
   * Falls back to the connection's default template if omitted.
   */
  receiptTemplateId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateS2sPaymentInput = z.infer<typeof createS2sPaymentSchema>;

// ── Bank Withdrawal (Outgoing Funds) ─────────────────────────────

export const createBankWithdrawalSchema = z.object({
  connectionId: z.string().uuid(),
  /**
   * Optional: link this withdrawal to a specific received payment.
   */
  paymentId: z.string().uuid().optional(),
  /**
   * Wallet address to debit — must have sufficient balance.
   */
  walletAddress: z.string().min(1),
  amount: z.union([z.string(), z.number()]).transform((v: string | number) => String(v)),
  currency: z.string().min(3).max(3).default("USD").transform((v) => v.toUpperCase()),
  feeAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v: string | number | undefined) => (v ? String(v) : "0")),
  // Beneficiary bank details
  bankName: z.string().min(1).max(255),
  bankCountry: z.string().min(2).max(2).toUpperCase(),
  accountHolderName: z.string().min(1).max(255),
  iban: z.string().max(34).optional(),
  swiftBic: z
    .string()
    .regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "Invalid BIC/SWIFT format")
    .optional(),
  accountNumber: z.string().max(64).optional(),
  routingNumber: z.string().max(20).optional(),
  bankAddress: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.iban || data.accountNumber || data.swiftBic,
  { message: "At least one of: iban, accountNumber, or swiftBic must be provided" },
);

export type CreateBankWithdrawalInput = z.infer<typeof createBankWithdrawalSchema>;

// ── Receipt Template JSON upload schema ─────────────────────────

/**
 * Schema for the JSON file upload endpoint.
 * Customers upload a JSON file whose body matches this structure.
 */
export const receiptTemplateUploadSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().default(false),
  template: templateJsonSchema,
});

export type ReceiptTemplateUpload = z.infer<typeof receiptTemplateUploadSchema>;

// ── Database row types (for raw SQL results) ────────────────────

export interface S2sConnectionRow {
  id: string;
  name: string;
  merchantId: string;
  endpointUrl: string;
  apiSecret: string;
  apiKeyHeader: string;
  callbackUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TESTING";
  allowedIps: string[];
  supportedCurrencies: string[];
  dailyLimitAmount: string | null;
  singleTxLimitAmount: string | null;
  receiptTemplateId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface S2sPaymentRow {
  id: string;
  reference: string;
  connectionId: string;
  merchantId: string;
  amount: string;
  currency: string;
  feeAmount: string;
  netAmount: string;
  senderReference: string | null;
  senderAccountId: string | null;
  receiverWalletAddr: string;
  journalEntryRef: string | null;
  receiptTemplateId: string | null;
  receiptData: Record<string, unknown> | null;
  status: "PENDING" | "PROCESSING" | "AUTHENTICATED" | "COMPLETED" | "FAILED" | "REVERSED" | "EXPIRED";
  authenticatedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface S2sBankWithdrawalRow {
  id: string;
  reference: string;
  connectionId: string;
  merchantId: string;
  paymentId: string | null;
  walletAddress: string;
  amount: string;
  currency: string;
  feeAmount: string;
  netAmount: string;
  bankName: string;
  bankCountry: string;
  accountHolderName: string;
  iban: string | null;
  swiftBic: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  bankAddress: string | null;
  journalEntryRef: string | null;
  status: "PENDING" | "SUBMITTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  submittedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface S2sReceiptTemplateRow {
  id: string;
  name: string;
  merchantId: string;
  description: string | null;
  templateJson: TemplateJson;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
