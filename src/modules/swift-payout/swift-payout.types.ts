import { z } from "zod";

const xmlText = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

const text = (max: number) => z.string()
  .trim()
  .min(1)
  .max(max)
  .regex(xmlText, "Control characters are not allowed");

const optionalText = (max: number) => z.string()
  .trim()
  .max(max)
  .regex(xmlText, "Control characters are not allowed")
  .optional();

function hasValidIbanChecksum(value: string): boolean {
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" && character <= "Z"
      ? String(character.charCodeAt(0) - 55)
      : character;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

const iban = z.string()
  .transform((value) => value.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, "Enter a valid IBAN"))
  .refine(hasValidIbanChecksum, "IBAN checksum is invalid");

const bic = z.string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/, "Enter an 8- or 11-character BIC"));

const partySchema = z.object({
  name: text(140),
  iban,
  agentBic: bic,
  agentName: optionalText(140),
  streetName: text(70),
  buildingNumber: optionalText(16),
  postalCode: optionalText(16),
  townName: text(35),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
});

const amount = z.string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,5})?$/, "Amount must be positive, without separators, and have at most 18 integer and 5 decimal digits")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero")
  .refine((value) => value.replace(".", "").length <= 18, "Amount exceeds the ISO 20022 18-digit precision limit");

export const swiftPayoutDraftSchema = z.object({
  settlementMethod: z.enum(["INDA", "INGA", "COVE", "CLRG"]).default("INDA"),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid settlement date"),
  settlementAmount: amount,
  settlementCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  instructedAmount: amount.optional(),
  instructedCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  chargeBearer: z.enum(["SHAR", "DEBT", "CRED", "SLEV"]).default("SHAR"),
  endToEndId: z.string().trim().max(35).regex(/^[A-Za-z0-9?/\-:.()+,' ]*$/).optional(),
  localInstrument: optionalText(35),
  categoryPurpose: optionalText(35),
  remittanceInformation: optionalText(140),
  debtor: partySchema,
  creditor: partySchema,
}).superRefine((value, context) => {
  if (value.instructedCurrency && !value.instructedAmount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["instructedAmount"],
      message: "An instructed currency requires an instructed amount",
    });
  }
});

export type SwiftPayoutDraftInput = z.infer<typeof swiftPayoutDraftSchema>;
