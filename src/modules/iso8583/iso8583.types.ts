import { z } from "zod";

/**
 * ISO 8583 field definitions.
 * Based on the ISO 8583:1987 + 1993 standard with common
 * extensions used in payment processing.
 */

export type FieldType = "n" | "an" | "ans" | "b" | "z" | "s" | "ll" | "lll";

export interface FieldDef {
  /** Field number 0-128 (0 is primary bitmap) */
  num: number;
  /** Field name */
  name: string;
  /** Data type: n=numeric, an=alphanumeric, ans=alphanumeric+special, b=binary, z=track data, s=special */
  type: FieldType;
  /** Maximum length */
  maxLength: number;
  /** Length type: fixed or variable (LL, LLL) */
  lengthType: "fixed" | "llvar" | "lllvar";
  /** Description */
  description?: string;
}

/** Standard ISO 8583 field definitions */
export const FIELD_DEFS: Record<number, FieldDef> = {
  0: { num: 0, name: "MTI", type: "n", maxLength: 4, lengthType: "fixed", description: "Message Type Indicator" },
  1: { num: 1, name: "Bitmap", type: "b", maxLength: 16, lengthType: "fixed", description: "Primary Bitmap" },
  2: { num: 2, name: "PAN", type: "n", maxLength: 19, lengthType: "llvar", description: "Primary Account Number" },
  3: { num: 3, name: "ProcessingCode", type: "n", maxLength: 6, lengthType: "fixed", description: "Processing Code" },
  4: { num: 4, name: "AmountTransaction", type: "n", maxLength: 12, lengthType: "fixed", description: "Amount, Transaction" },
  5: { num: 5, name: "AmountSettlement", type: "n", maxLength: 12, lengthType: "fixed", description: "Amount, Settlement" },
  6: { num: 6, name: "AmountCardholder", type: "n", maxLength: 12, lengthType: "fixed", description: "Amount, Cardholder Billing" },
  7: { num: 7, name: "TransmissionDateTime", type: "n", maxLength: 10, lengthType: "fixed", description: "Transmission Date & Time" },
  8: { num: 8, name: "AmountCardFee", type: "n", maxLength: 8, lengthType: "fixed", description: "Amount, Cardholder Billing Fee" },
  9: { num: 9, name: "ConversionRateSettlement", type: "n", maxLength: 8, lengthType: "fixed", description: "Conversion Rate, Settlement" },
  10: { num: 10, name: "ConversionRateCardholder", type: "n", maxLength: 8, lengthType: "fixed", description: "Conversion Rate, Cardholder Billing" },
  11: { num: 11, name: "STAN", type: "n", maxLength: 6, lengthType: "fixed", description: "System Trace Audit Number" },
  12: { num: 12, name: "LocalTime", type: "n", maxLength: 6, lengthType: "fixed", description: "Local Transaction Time" },
  13: { num: 13, name: "LocalDate", type: "n", maxLength: 4, lengthType: "fixed", description: "Local Transaction Date" },
  14: { num: 14, name: "ExpirationDate", type: "n", maxLength: 4, lengthType: "fixed", description: "Expiration Date" },
  15: { num: 15, name: "SettlementDate", type: "n", maxLength: 4, lengthType: "fixed", description: "Settlement Date" },
  16: { num: 16, name: "ConversionDate", type: "n", maxLength: 4, lengthType: "fixed", description: "Currency Conversion Date" },
  17: { num: 17, name: "CaptureDate", type: "n", maxLength: 4, lengthType: "fixed", description: "Capture Date" },
  18: { num: 18, name: "MerchantType", type: "n", maxLength: 4, lengthType: "fixed", description: "Merchant Type / MCC" },
  19: { num: 19, name: "AcquiringInstitutionCode", type: "n", maxLength: 6, lengthType: "fixed", description: "Acquiring Institution ID" },
  20: { num: 20, name: "PANExtended", type: "n", maxLength: 3, lengthType: "fixed", description: "PAN Extended Country Code" },
  21: { num: 21, name: "ForwardingInstitutionCode", type: "n", maxLength: 6, lengthType: "fixed", description: "Forwarding Institution ID" },
  22: { num: 22, name: "POSEntryMode", type: "n", maxLength: 3, lengthType: "fixed", description: "POS Entry Mode" },
  23: { num: 23, name: "PANSequenceNumber", type: "n", maxLength: 3, lengthType: "fixed", description: "Card Sequence Number" },
  24: { num: 24, name: "NetworkInternationalID", type: "n", maxLength: 3, lengthType: "fixed", description: "Network International ID" },
  25: { num: 25, name: "POSConditionCode", type: "n", maxLength: 2, lengthType: "fixed", description: "POS Condition Code" },
  26: { num: 26, name: "POSConditionCode2", type: "n", maxLength: 2, lengthType: "fixed", description: "POS Condition Code" },
  27: { num: 27, name: "AuthorizationIDResp", type: "n", maxLength: 6, lengthType: "fixed", description: "Authorization Identification Response" },
  28: { num: 28, name: "AmountFee", type: "an", maxLength: 9, lengthType: "fixed", description: "Amount, Transaction Fee" },
  29: { num: 29, name: "AmountSettlementFee", type: "an", maxLength: 9, lengthType: "fixed", description: "Amount, Settlement Fee" },
  30: { num: 30, name: "AmountTransactionFeeProc", type: "an", maxLength: 9, lengthType: "fixed", description: "Amount, Transaction Processing Fee" },
  31: { num: 31, name: "AmountSettlementFeeProc", type: "an", maxLength: 9, lengthType: "fixed", description: "Amount, Settlement Processing Fee" },
  32: { num: 32, name: "AcquiringInstitutionID", type: "n", maxLength: 11, lengthType: "llvar", description: "Acquiring Institution ID" },
  33: { num: 33, name: "ForwardingInstitutionID", type: "n", maxLength: 11, lengthType: "llvar", description: "Forwarding Institution ID" },
  34: { num: 34, name: "PANExtended2", type: "ans", maxLength: 28, lengthType: "llvar", description: "Primary Account Number Extended" },
  35: { num: 35, name: "Track2", type: "z", maxLength: 37, lengthType: "llvar", description: "Track 2 Data" },
  36: { num: 36, name: "Track3", type: "z", maxLength: 104, lengthType: "lllvar", description: "Track 3 Data" },
  37: { num: 37, name: "RRN", type: "an", maxLength: 12, lengthType: "fixed", description: "Retrieval Reference Number" },
  38: { num: 38, name: "ApprovalCode", type: "an", maxLength: 6, lengthType: "fixed", description: "Approval Code" },
  39: { num: 39, name: "ResponseCode", type: "an", maxLength: 2, lengthType: "fixed", description: "Response Code" },
  40: { num: 40, name: "ServiceRestrictionCode", type: "an", maxLength: 3, lengthType: "fixed", description: "Service Restriction Code" },
  41: { num: 41, name: "TerminalID", type: "ans", maxLength: 8, lengthType: "fixed", description: "Card Acceptor Terminal ID" },
  42: { num: 42, name: "MerchantID", type: "ans", maxLength: 15, lengthType: "fixed", description: "Card Acceptor ID" },
  43: { num: 43, name: "CardAcceptorName", type: "ans", maxLength: 40, lengthType: "fixed", description: "Card Acceptor Name/Location" },
  44: { num: 44, name: "AdditionalResponseData", type: "ans", maxLength: 25, lengthType: "llvar", description: "Additional Response Data" },
  45: { num: 45, name: "Track1", type: "ans", maxLength: 76, lengthType: "llvar", description: "Track 1 Data" },
  46: { num: 46, name: "AdditionalData47", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data - ISO" },
  47: { num: 47, name: "AdditionalData47", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data - National" },
  48: { num: 48, name: "AdditionalData48", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data - Private" },
  49: { num: 49, name: "CurrencyCode", type: "n", maxLength: 3, lengthType: "fixed", description: "Currency Code, Transaction" },
  50: { num: 50, name: "CurrencyCodeSettlement", type: "n", maxLength: 3, lengthType: "fixed", description: "Currency Code, Settlement" },
  51: { num: 51, name: "CurrencyCodeCardholder", type: "n", maxLength: 3, lengthType: "fixed", description: "Currency Code, Cardholder Billing" },
  52: { num: 52, name: "PINBlock", type: "b", maxLength: 16, lengthType: "fixed", description: "PIN Data" },
  53: { num: 53, name: "SecurityRelatedControlInfo", type: "an", maxLength: 16, lengthType: "llvar", description: "Security Related Control Information" },
  54: { num: 54, name: "AdditionalAmounts", type: "ans", maxLength: 120, lengthType: "lllvar", description: "Additional Amounts" },
  55: { num: 55, name: "ICCData", type: "ans", maxLength: 255, lengthType: "lllvar", description: "ICC System Related Data" },
  56: { num: 56, name: "MessageReasonCode", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Message Reason Code (reserved ISO)" },
  57: { num: 57, name: "AuthorizationLifeCycleCode", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Authorization Life Cycle Code" },
  58: { num: 58, name: "AuthorizingAgentID", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Authorizing Agent ID" },
  59: { num: 59, name: "TransportData", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Transport Data" },
  60: { num: 60, name: "ReservedPrivate1", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Reserved Private (Network)" },
  61: { num: 61, name: "ReservedPrivate2", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Reserved Private (POS)" },
  62: { num: 62, name: "ReservedPrivate3", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Reserved Private" },
  63: { num: 63, name: "ReservedPrivate4", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Reserved Private" },
  64: { num: 64, name: "MAC", type: "b", maxLength: 8, lengthType: "fixed", description: "Message Authentication Code" },
  90: { num: 90, name: "OriginalDataElements", type: "n", maxLength: 42, lengthType: "fixed", description: "Original Data Elements" },
  95: { num: 95, name: "ReplacementAmounts", type: "an", maxLength: 42, lengthType: "fixed", description: "Replacement Amounts" },
  100: { num: 100, name: "ReceivingInstitutionID", type: "n", maxLength: 11, lengthType: "llvar", description: "Receiving Institution ID" },
  102: { num: 102, name: "AccountID1", type: "ans", maxLength: 28, lengthType: "llvar", description: "Account Identification 1" },
  103: { num: 103, name: "AccountID2", type: "ans", maxLength: 28, lengthType: "llvar", description: "Account Identification 2" },
  104: { num: 104, name: "TransactionDescription", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Transaction Description" },
  123: { num: 123, name: "AdditionalData123", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data" },
  124: { num: 124, name: "AdditionalData124", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data" },
  125: { num: 125, name: "AdditionalData125", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data" },
  126: { num: 126, name: "AdditionalData126", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data" },
  127: { num: 127, name: "AdditionalData127", type: "ans", maxLength: 999, lengthType: "lllvar", description: "Additional Data" },
  128: { num: 128, name: "MAC2", type: "b", maxLength: 8, lengthType: "fixed", description: "Message Authentication Code 2" },
};

/** Common MTI values */
export const MTI_VALUES = {
  AUTHORIZATION_REQUEST: "0100",
  AUTHORIZATION_RESPONSE: "0110",
  AUTHORIZATION_ADVICE: "0120",
  AUTHORIZATION_ADVICE_REPEAT: "0121",
  REVERSAL_REQUEST: "0400",
  REVERSAL_RESPONSE: "0410",
  REVERSAL_ADVICE: "0420",
  REVERSAL_ADVICE_REPEAT: "0421",
  NETWORK_MANAGEMENT_REQUEST: "0800",
  NETWORK_MANAGEMENT_RESPONSE: "0810",
  SETTLEMENT_REQUEST: "0500",
  SETTLEMENT_RESPONSE: "0510",
  SETTLEMENT_ADVICE: "0520",
} as const;

// ── Zod Schemas ──────────────────────────────────

export const parseMessageSchema = z.object({
  message: z.string().min(1, "ISO8583 message hex string is required"),
  encoding: z.enum(["ascii", "binary"]).default("ascii"),
});

export const buildMessageSchema = z.object({
  mti: z.string().length(4),
  fields: z.record(z.string()),
  encoding: z.enum(["ascii", "binary"]).default("ascii"),
});

export const createHostConnectionSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["TCP", "TLS", "NAC", "HTTP"]).default("TCP"),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  timeout: z.number().int().min(1000).max(120000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
  keepAlive: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

export type ParseMessageInput = z.infer<typeof parseMessageSchema>;
export type BuildMessageInput = z.infer<typeof buildMessageSchema>;
export type CreateHostConnectionInput = z.infer<typeof createHostConnectionSchema>;
