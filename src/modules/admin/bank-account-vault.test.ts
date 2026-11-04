import { afterEach, describe, expect, it } from "vitest";
import {
  decryptBankAccountDetails,
  encryptBankAccountDetails,
  type BankAccountDetails,
} from "./bank-account-vault.js";

const originalKey = process.env.BANK_DETAILS_ENCRYPTION_KEY;
const key = Buffer.alloc(32, 7).toString("base64");

const details: BankAccountDetails = {
  bankName: "Example Bank",
  bankAddress: "1 Example Street",
  accountName: "Example Account",
  accountSignatory: "Example Signatory",
  accountNumber: "000012345678",
  wireRoutingNumber: "123456789",
  swiftUsd: "EXAMPLEUS1",
  swiftOtherCurrency: "EXAMPLEUS2",
};

afterEach(() => {
  if (originalKey === undefined) delete process.env.BANK_DETAILS_ENCRYPTION_KEY;
  else process.env.BANK_DETAILS_ENCRYPTION_KEY = originalKey;
});

describe("bank account vault", () => {
  it("encrypts details and decrypts them only with the configured key", () => {
    process.env.BANK_DETAILS_ENCRYPTION_KEY = key;
    const envelope = encryptBankAccountDetails(details);

    expect(envelope).toMatch(/^v1\./);
    expect(envelope).not.toContain(details.accountNumber);
    expect(decryptBankAccountDetails(envelope)).toEqual(details);
  });

  it("rejects missing or incorrectly sized keys", () => {
    delete process.env.BANK_DETAILS_ENCRYPTION_KEY;
    expect(() => encryptBankAccountDetails(details)).toThrow("Bank details encryption is not configured");

    process.env.BANK_DETAILS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptBankAccountDetails(details)).toThrow("Bank details encryption is not configured");
  });

  it("rejects tampered encrypted details", () => {
    process.env.BANK_DETAILS_ENCRYPTION_KEY = key;
    const envelope = encryptBankAccountDetails(details);
    const [version, iv, tag, ciphertext] = envelope.split(".");
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[0] ^= 1;
    const tampered = `${version}.${iv}.${tag}.${bytes.toString("base64url")}`;

    expect(() => decryptBankAccountDetails(tampered)).toThrow("Stored bank details cannot be decrypted");
  });
});
