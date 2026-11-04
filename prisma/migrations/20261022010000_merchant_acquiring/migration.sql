ALTER TYPE "MerchantStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "MerchantStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "MerchantStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

ALTER TABLE "Merchant"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "merchantCategory" TEXT,
  ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "pricingPlanId" TEXT,
  ADD COLUMN "agentId" TEXT;

CREATE INDEX "Merchant_pricingPlanId_idx" ON "Merchant"("pricingPlanId");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");

CREATE TABLE "MerchantMid" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "mid" TEXT NOT NULL,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantMid_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantMid_mid_key" ON "MerchantMid"("mid");
CREATE INDEX "MerchantMid_merchantId_status_idx" ON "MerchantMid"("merchantId", "status");
ALTER TABLE "MerchantMid" ADD CONSTRAINT "MerchantMid_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MerchantAccount" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "settlementAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantAccount_merchantId_walletId_key" ON "MerchantAccount"("merchantId", "walletId");
CREATE INDEX "MerchantAccount_settlementAccountId_idx" ON "MerchantAccount"("settlementAccountId");
ALTER TABLE "MerchantAccount" ADD CONSTRAINT "MerchantAccount_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantAccount" ADD CONSTRAINT "MerchantAccount_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantAccount" ADD CONSTRAINT "MerchantAccount_settlementAccountId_fkey"
  FOREIGN KEY ("settlementAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MerchantRiskProfile" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "dailyLimit" DECIMAL(18,2),
  "monthlyLimit" DECIMAL(18,2),
  "chargebackLimit" DECIMAL(18,2),
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantRiskProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantRiskProfile_merchantId_key" ON "MerchantRiskProfile"("merchantId");
ALTER TABLE "MerchantRiskProfile" ADD CONSTRAINT "MerchantRiskProfile_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PricingPlan" (
  "id" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "transactionFee" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "settlementFee" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "payoutFee" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PricingPlan_planName_key" ON "PricingPlan"("planName");
CREATE INDEX "PricingPlan_active_idx" ON "PricingPlan"("active");
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_pricingPlanId_fkey"
  FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Agent" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "commissionRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "parentAgentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Agent_code_key" ON "Agent"("code");
CREATE INDEX "Agent_parentAgentId_idx" ON "Agent"("parentAgentId");
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_parentAgentId_fkey"
  FOREIGN KEY ("parentAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_merchantId_status_createdAt_idx" ON "Invoice"("merchantId", "status", "createdAt");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PaymentLink" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentLink_reference_key" ON "PaymentLink"("reference");
CREATE INDEX "PaymentLink_merchantId_status_createdAt_idx" ON "PaymentLink"("merchantId", "status", "createdAt");
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MerchantKycDocument" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentReference" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantKycDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MerchantKycDocument_merchantId_verificationStatus_idx"
  ON "MerchantKycDocument"("merchantId", "verificationStatus");
ALTER TABLE "MerchantKycDocument" ADD CONSTRAINT "MerchantKycDocument_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
