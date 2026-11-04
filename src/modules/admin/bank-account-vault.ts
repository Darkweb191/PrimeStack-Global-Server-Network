import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../../core/errors.js";

export interface BankAccountDetails {
  bankName: string;
  bankAddress: string;
  accountName: string;
  accountSignatory: string;
  accountNumber: string;
  wireRoutingNumber: string;
  swiftUsd: string;
  swiftOtherCurrency: string;
}

function isBankAccountDetails(value: unknown): value is BankAccountDetails {
  if (typeof value !== "object" || value === null) return false;
  const details = value as Record<string, unknown>;
  return [
    "bankName",
    "bankAddress",
    "accountName",
    "accountSignatory",
    "accountNumber",
    "wireRoutingNumber",
    "swiftUsd",
    "swiftOtherCurrency",
  ].every((field) => typeof details[field] === "string");
}

function encryptionKey(): Buffer {
  const encoded = process.env.BANK_DETAILS_ENCRYPTION_KEY;
  if (!encoded) {
    throw new AppError("Bank details encryption is not configured", 503, "ENCRYPTION_NOT_CONFIGURED");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== encoded) {
    throw new AppError("Bank details encryption is not configured", 503, "ENCRYPTION_NOT_CONFIGURED");
  }

  return key;
}

export function encryptBankAccountDetails(details: BankAccountDetails): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(details), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptBankAccountDetails(envelope: string): BankAccountDetails {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new AppError("Stored bank details cannot be decrypted", 500, "BANK_DETAILS_DECRYPTION_FAILED");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const details: unknown = JSON.parse(plaintext);
    if (!isBankAccountDetails(details)) throw new Error("Invalid bank details payload");
    return details;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Stored bank details cannot be decrypted", 500, "BANK_DETAILS_DECRYPTION_FAILED");
  }
}
