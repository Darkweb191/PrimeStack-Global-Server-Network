CREATE TYPE "PagAssetType" AS ENUM (
  'FIAT',
  'DIGITAL',
  'LOYALTY',
  'REWARD',
  'STORED_VALUE',
  'MERCHANT_CREDIT'
);

CREATE TABLE "AssetRegistry" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "PagAssetType" NOT NULL,
  "precision" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetRegistry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetRegistry_code_key" ON "AssetRegistry"("code");
CREATE INDEX "AssetRegistry_type_active_idx" ON "AssetRegistry"("type", "active");

CREATE TABLE "NetworkDirectory" (
  "id" TEXT NOT NULL,
  "networkName" TEXT NOT NULL,
  "networkType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkDirectory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NetworkDirectory_networkName_key" ON "NetworkDirectory"("networkName");
CREATE INDEX "NetworkDirectory_status_idx" ON "NetworkDirectory"("status");
CREATE INDEX "NetworkDirectory_networkType_idx" ON "NetworkDirectory"("networkType");

CREATE TABLE "AssetAccount" (
  "id" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetAccount_accountNumber_key" ON "AssetAccount"("accountNumber");
CREATE INDEX "AssetAccount_assetId_ownerType_ownerId_idx" ON "AssetAccount"("assetId", "ownerType", "ownerId");
ALTER TABLE "AssetAccount" ADD CONSTRAINT "AssetAccount_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetLedger" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "amount" DECIMAL(30,8) NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetLedger_reference_key" ON "AssetLedger"("reference");
CREATE INDEX "AssetLedger_assetId_createdAt_idx" ON "AssetLedger"("assetId", "createdAt");
CREATE INDEX "AssetLedger_debitAccountId_createdAt_idx" ON "AssetLedger"("debitAccountId", "createdAt");
CREATE INDEX "AssetLedger_creditAccountId_createdAt_idx" ON "AssetLedger"("creditAccountId", "createdAt");
ALTER TABLE "AssetLedger" ADD CONSTRAINT "AssetLedger_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetLedger" ADD CONSTRAINT "AssetLedger_debitAccountId_fkey"
  FOREIGN KEY ("debitAccountId") REFERENCES "AssetAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetLedger" ADD CONSTRAINT "AssetLedger_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "AssetAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetRoute" (
  "id" TEXT NOT NULL,
  "sourceNetworkId" TEXT NOT NULL,
  "destinationNetworkId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "costPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "estimatedLatencyMs" INTEGER NOT NULL DEFAULT 0,
  "availabilityScore" INTEGER NOT NULL DEFAULT 100,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetRoute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetRoute_sourceNetworkId_destinationNetworkId_assetId_key"
  ON "AssetRoute"("sourceNetworkId", "destinationNetworkId", "assetId");
CREATE INDEX "AssetRoute_sourceNetworkId_assetId_active_idx" ON "AssetRoute"("sourceNetworkId", "assetId", "active");
CREATE INDEX "AssetRoute_destinationNetworkId_assetId_active_idx" ON "AssetRoute"("destinationNetworkId", "assetId", "active");
CREATE INDEX "AssetRoute_priority_idx" ON "AssetRoute"("priority");
ALTER TABLE "AssetRoute" ADD CONSTRAINT "AssetRoute_sourceNetworkId_fkey"
  FOREIGN KEY ("sourceNetworkId") REFERENCES "NetworkDirectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRoute" ADD CONSTRAINT "AssetRoute_destinationNetworkId_fkey"
  FOREIGN KEY ("destinationNetworkId") REFERENCES "NetworkDirectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetRoute" ADD CONSTRAINT "AssetRoute_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConversionRate" (
  "id" TEXT NOT NULL,
  "sourceAssetId" TEXT NOT NULL,
  "destinationAssetId" TEXT NOT NULL,
  "rate" DECIMAL(20,8) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversionRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConversionRate_sourceAssetId_destinationAssetId_key"
  ON "ConversionRate"("sourceAssetId", "destinationAssetId");
CREATE INDEX "ConversionRate_active_updatedAt_idx" ON "ConversionRate"("active", "updatedAt");
ALTER TABLE "ConversionRate" ADD CONSTRAINT "ConversionRate_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversionRate" ADD CONSTRAINT "ConversionRate_destinationAssetId_fkey"
  FOREIGN KEY ("destinationAssetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetLiquidityPool" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "availableBalance" DECIMAL(30,8) NOT NULL DEFAULT 0,
  "reservedBalance" DECIMAL(30,8) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetLiquidityPool_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetLiquidityPool_assetId_networkId_key" ON "AssetLiquidityPool"("assetId", "networkId");
CREATE INDEX "AssetLiquidityPool_networkId_assetId_idx" ON "AssetLiquidityPool"("networkId", "assetId");
ALTER TABLE "AssetLiquidityPool" ADD CONSTRAINT "AssetLiquidityPool_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "AssetRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetLiquidityPool" ADD CONSTRAINT "AssetLiquidityPool_networkId_fkey"
  FOREIGN KEY ("networkId") REFERENCES "NetworkDirectory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ComplianceCheck" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "assetId" TEXT,
  "result" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "details" JSONB,
  CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComplianceCheck_reference_checkedAt_idx" ON "ComplianceCheck"("reference", "checkedAt");
CREATE INDEX "ComplianceCheck_result_checkedAt_idx" ON "ComplianceCheck"("result", "checkedAt");
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "AssetRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
