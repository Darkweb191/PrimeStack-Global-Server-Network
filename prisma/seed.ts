/**
 * PrimeStack Switch — Database Seed Script
 *
 * Creates the foundational ledger accounts, an admin user, a sample
 * merchant with HMAC credentials, and an IP whitelist entry.
 *
 * Run with: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, createHmac } from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding PrimeStack Switch database...\n");

  // ── 1. System Ledger Accounts ──────────────────
  console.log("Creating system ledger accounts...");

  const systemAccounts = [
    { code: "SYSTEM-FUNDING-USD", name: "System Funding Account", type: "ASSET" as const, subtype: "FUNDING" },
    { code: "FEE-SETTLEMENT-USD", name: "Settlement Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-T2T-USD", name: "T2T Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-S2S-USD", name: "S2S Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-IP2IP-USD", name: "IP2IP Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-WALLET-USD", name: "Wallet Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-MERCHANT-USD", name: "Merchant Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "FEE-BULK-USD", name: "Bulk Transfer Fee Account", type: "REVENUE" as const, subtype: "FEE" },
    { code: "SETTLEMENT-USD", name: "Settlement Clearing Account", type: "ASSET" as const, subtype: "SETTLEMENT" },
    { code: "CHARGEBACK-USD", name: "Chargeback Reserve Account", type: "LIABILITY" as const, subtype: "CHARGEBACK" },
  ];

  for (const acct of systemAccounts) {
    await prisma.account.upsert({
      where: { code: acct.code },
      update: {},
      create: {
        code: acct.code,
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        currency: "USD",
        balance: 1000000, // seed with 1M for testing
      },
    });
    console.log(`  ✓ ${acct.code}`);
  }

  // ── 1b. Payment Rails Ledger Accounts ──────────
  // Each incoming rails transfer posts two balanced entries:
  //   WISE:INCOMING → RAILS:IN_TRANSIT (received, in flight)
  //   RAILS:IN_TRANSIT → RAILS:PAYOUT_DISPATCHED (payout sent)
  // WISE:INCOMING is an ASSET so the debit needs no pre-funded balance.
  console.log("\nCreating payment rails ledger accounts...");

  const railsCurrencies = ["USD", "GBP", "EUR", "AED", "NGN", "KES"];
  const railsAccountSpecs = [
    { prefix: "WISE:INCOMING",           name: "Wise Incoming",           type: "ASSET" as const,     subtype: "WISE_INCOMING" },
    { prefix: "RAILS:IN_TRANSIT",        name: "Rails In Transit",        type: "LIABILITY" as const, subtype: "RAILS_TRANSIT" },
    { prefix: "RAILS:PAYOUT_DISPATCHED", name: "Rails Payout Dispatched", type: "EXPENSE" as const,   subtype: "RAILS_PAYOUT" },
    { prefix: "RAILS:UNMATCHED",         name: "Rails Unmatched",         type: "LIABILITY" as const, subtype: "RAILS_UNMATCHED" },
  ];

  for (const currency of railsCurrencies) {
    for (const spec of railsAccountSpecs) {
      const code = `${spec.prefix}:${currency}`;
      await prisma.account.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: `${spec.name} (${currency})`,
          type: spec.type,
          subtype: spec.subtype,
          currency,
          balance: 0,
        },
      });
    }
  }
  console.log(`  ✓ ${railsAccountSpecs.length * railsCurrencies.length} rails ledger accounts (${railsCurrencies.join(", ")})`);

  // ── 2. Admin User ──────────────────────────────
  console.log("\nCreating admin user...");

  const adminPassword = await bcrypt.hash("Admin@2026", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@primestack.io" },
    update: {},
    create: {
      email: "admin@primestack.io",
      username: "admin",
      passwordHash: adminPassword,
      fullName: "System Administrator",
      role: "SUPER_ADMIN",
      preferredLang: "en",
      isActive: true,
    },
  });
  console.log(`  ✓ admin@primestack.io (password: Admin@2026)`);

  // ── 3. Sample Merchant ─────────────────────────
  console.log("\nCreating sample merchant...");

  const merchant = await prisma.merchant.upsert({
    where: { code: "MERCHANT-001" },
    update: {},
    create: {
      code: "MERCHANT-001",
      legalName: "PrimeStack Demo Merchant",
      dbaName: "Demo Merchant",
      email: "merchant@demo.com",
      phone: "+1234567890",
      country: "US",
      preferredLang: "en",
      status: "ACTIVE",
      mcc: "5411",
    },
  });
  console.log(`  ✓ ${merchant.code} (${merchant.legalName})`);

  // Create merchant ledger account
  const merchantAccountCode = `MERCHANT-${merchant.code}-USD`;
  await prisma.account.upsert({
    where: { code: merchantAccountCode },
    update: {},
    create: {
      code: merchantAccountCode,
      name: `Merchant Account: ${merchant.code}`,
      type: "LIABILITY",
      subtype: "MERCHANT",
      currency: "USD",
      balance: 0,
    },
  });
  console.log(`  ✓ Ledger account: ${merchantAccountCode}`);

  // ── 4. HMAC Key for Merchant ────────────────────
  console.log("\nCreating HMAC key for merchant...");

  const keyId = "psk_demo_key_001";
  const hmacSecret = randomBytes(32).toString("hex");

  await prisma.hmacKey.upsert({
    where: { keyId },
    update: {},
    create: {
      keyId,
      secret: hmacSecret,
      merchantId: merchant.id,
      algorithm: "sha256",
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ Key ID: ${keyId}`);
  console.log(`  ✓ Secret: ${hmacSecret}`);

  // ── 4b. Console Operator HMAC Key ───────────────
  // The dashboard console signs its proxied API calls with this key so the
  // closed-by-default Fastify API accepts them. The secret must match the
  // CONSOLE_HMAC_SECRET env var read by the console at runtime.
  console.log("\nCreating console operator HMAC key...");

  const consoleKeyId = process.env.CONSOLE_HMAC_KEY_ID || "psk_console_001";
  const consoleSecret = process.env.CONSOLE_HMAC_SECRET || randomBytes(32).toString("hex");

  await prisma.hmacKey.upsert({
    where: { keyId: consoleKeyId },
    update: { secret: consoleSecret, status: "ACTIVE" },
    create: {
      keyId: consoleKeyId,
      secret: consoleSecret,
      merchantId: merchant.id,
      algorithm: "sha256",
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ Console key ID: ${consoleKeyId}`);
  if (!process.env.CONSOLE_HMAC_SECRET) {
    console.log(`  ! CONSOLE_HMAC_SECRET not set — generated: ${consoleSecret}`);
    console.log("    Set CONSOLE_HMAC_SECRET to this value so the console can sign requests.");
  }

  // ── 5. IP Whitelist ─────────────────────────────
  console.log("\nCreating IP whitelist entries...");

  await prisma.ipWhitelistEntry.upsert({
    where: {
      id: "seed-ip-localhost",
    },
    update: {},
    create: {
      id: "seed-ip-localhost",
      ipAddress: "127.0.0.1",
      label: "Localhost (development)",
      status: "ACTIVE",
    },
  });
  console.log("  ✓ 127.0.0.1 (localhost)");

  await prisma.ipWhitelistEntry.upsert({
    where: {
      id: "seed-ip-any",
    },
    update: {},
    create: {
      id: "seed-ip-any",
      ipAddress: "0.0.0.0/0",
      label: "Allow all (development only — remove in production)",
      status: "ACTIVE",
    },
  });
  console.log("  ✓ 0.0.0.0/0 (allow all — dev only)");

  // ── 6. Default Fraud Rules ─────────────────────
  console.log("\nCreating default fraud rules...");

  await prisma.fraudRule.upsert({
    where: { id: "seed-rule-velocity-card" },
    update: {},
    create: {
      id: "seed-rule-velocity-card",
      name: "Card Velocity — Max 10 per minute",
      type: "VELOCITY",
      status: "ACTIVE",
      condition: {
        windowSeconds: 60,
        maxCount: 10,
        entity: "CARD",
      },
      action: "BLOCK",
      priority: 10,
    },
  });
  console.log("  ✓ Card velocity rule (10/min)");

  await prisma.fraudRule.upsert({
    where: { id: "seed-rule-aml-threshold" },
    update: {},
    create: {
      id: "seed-rule-aml-threshold",
      name: "AML — Large Transaction Review",
      type: "AML",
      status: "ACTIVE",
      condition: {
        thresholdAmount: 10000,
        currency: "USD",
        action: "REVIEW",
      },
      action: "REVIEW",
      priority: 5,
    },
  });
  console.log("  ✓ AML threshold rule ($10,000)");

  console.log("\n✅ Seed completed successfully!\n");
  console.log("Admin login:  admin@primestack.io / Admin@2026");
  console.log("HMAC Key ID:  psk_demo_key_001");
  console.log(`HMAC Secret:  ${hmacSecret}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
