CREATE TYPE "DeveloperApplicationType" AS ENUM (
  'MERCHANT_APP',
  'TERMINAL_APP',
  'WALLET_APP',
  'TREASURY_APP',
  'PARTNER_APP'
);

CREATE TABLE "DeveloperApiRatePlan" (
  "id" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "requestsPerMinute" INTEGER,
  "dailyLimit" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperApiRatePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperApiRatePlan_planName_key" ON "DeveloperApiRatePlan"("planName");

CREATE TABLE "DeveloperApplication" (
  "id" TEXT NOT NULL,
  "appName" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "appType" "DeveloperApplicationType" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "ratePlanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeveloperApplication_ownerId_idx" ON "DeveloperApplication"("ownerId");
CREATE INDEX "DeveloperApplication_status_createdAt_idx" ON "DeveloperApplication"("status", "createdAt");
CREATE INDEX "DeveloperApplication_ratePlanId_idx" ON "DeveloperApplication"("ratePlanId");
ALTER TABLE "DeveloperApplication" ADD CONSTRAINT "DeveloperApplication_ratePlanId_fkey"
  FOREIGN KEY ("ratePlanId") REFERENCES "DeveloperApiRatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeveloperApplicationKey" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "secretLast4" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "DeveloperApplicationKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperApplicationKey_keyId_key" ON "DeveloperApplicationKey"("keyId");
CREATE INDEX "DeveloperApplicationKey_applicationId_active_idx" ON "DeveloperApplicationKey"("applicationId", "active");
ALTER TABLE "DeveloperApplicationKey" ADD CONSTRAINT "DeveloperApplicationKey_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "DeveloperApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeveloperApiProduct" (
  "id" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperApiProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperApiProduct_productName_key" ON "DeveloperApiProduct"("productName");

CREATE TABLE "DeveloperApplicationProduct" (
  "applicationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeveloperApplicationProduct_pkey" PRIMARY KEY ("applicationId", "productId")
);
CREATE INDEX "DeveloperApplicationProduct_productId_idx" ON "DeveloperApplicationProduct"("productId");
ALTER TABLE "DeveloperApplicationProduct" ADD CONSTRAINT "DeveloperApplicationProduct_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "DeveloperApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperApplicationProduct" ADD CONSTRAINT "DeveloperApplicationProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "DeveloperApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeveloperWebhook" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "callbackUrl" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperWebhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeveloperWebhook_applicationId_active_idx" ON "DeveloperWebhook"("applicationId", "active");
CREATE INDEX "DeveloperWebhook_eventName_active_idx" ON "DeveloperWebhook"("eventName", "active");
ALTER TABLE "DeveloperWebhook" ADD CONSTRAINT "DeveloperWebhook_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "DeveloperApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeveloperSdkVersion" (
  "id" TEXT NOT NULL,
  "sdkName" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperSdkVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperSdkVersion_sdkName_language_version_key"
  ON "DeveloperSdkVersion"("sdkName", "language", "version");
CREATE INDEX "DeveloperSdkVersion_language_idx" ON "DeveloperSdkVersion"("language");

CREATE TABLE "DeveloperPartner" (
  "id" TEXT NOT NULL,
  "partnerName" TEXT NOT NULL,
  "partnerType" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperPartner_partnerName_partnerType_key"
  ON "DeveloperPartner"("partnerName", "partnerType");
CREATE INDEX "DeveloperPartner_active_idx" ON "DeveloperPartner"("active");

CREATE TABLE "DeveloperCertification" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "certificationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperCertification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeveloperCertification_applicationId_status_idx"
  ON "DeveloperCertification"("applicationId", "status");
ALTER TABLE "DeveloperCertification" ADD CONSTRAINT "DeveloperCertification_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "DeveloperApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
