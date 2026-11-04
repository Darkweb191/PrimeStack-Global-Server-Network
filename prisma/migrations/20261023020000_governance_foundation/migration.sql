-- CreateTable
CREATE TABLE "EnterpriseRisk" (
    "id" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mitigation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisasterRecoveryPlan" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "rtoMinutes" INTEGER NOT NULL,
    "rpoMinutes" INTEGER NOT NULL,
    "planReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisasterRecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceBackupRecord" (
    "id" TEXT NOT NULL,
    "backupType" TEXT NOT NULL,
    "backupDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "locationReference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceBackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceKeyRecord" (
    "id" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceKeyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRetentionPolicy" (
    "id" TEXT NOT NULL,
    "policyName" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceChangeRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "implementedBy" TEXT,
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryReportRecord" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportingPeriod" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "artifactReference" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryReportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceVendor" (
    "id" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "riskRating" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuityTestRecord" (
    "id" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL,
    "notes" TEXT,
    "conductedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContinuityTestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnterpriseRisk_riskCategory_status_idx" ON "EnterpriseRisk"("riskCategory", "status");

-- CreateIndex
CREATE INDEX "EnterpriseRisk_createdAt_idx" ON "EnterpriseRisk"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisasterRecoveryPlan_serviceName_key" ON "DisasterRecoveryPlan"("serviceName");

-- CreateIndex
CREATE INDEX "DisasterRecoveryPlan_status_idx" ON "DisasterRecoveryPlan"("status");

-- CreateIndex
CREATE INDEX "GovernanceBackupRecord_backupDate_idx" ON "GovernanceBackupRecord"("backupDate");

-- CreateIndex
CREATE INDEX "GovernanceBackupRecord_status_backupDate_idx" ON "GovernanceBackupRecord"("status", "backupDate");

-- CreateIndex
CREATE INDEX "GovernanceKeyRecord_purpose_status_idx" ON "GovernanceKeyRecord"("purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataRetentionPolicy_policyName_key" ON "DataRetentionPolicy"("policyName");

-- CreateIndex
CREATE INDEX "DataRetentionPolicy_active_dataCategory_idx" ON "DataRetentionPolicy"("active", "dataCategory");

-- CreateIndex
CREATE INDEX "GovernanceChangeRequest_approvalStatus_createdAt_idx" ON "GovernanceChangeRequest"("approvalStatus", "createdAt");

-- CreateIndex
CREATE INDEX "GovernanceChangeRequest_riskLevel_idx" ON "GovernanceChangeRequest"("riskLevel");

-- CreateIndex
CREATE INDEX "RegulatoryReportRecord_reportType_reportingPeriod_idx" ON "RegulatoryReportRecord"("reportType", "reportingPeriod");

-- CreateIndex
CREATE INDEX "RegulatoryReportRecord_status_generatedAt_idx" ON "RegulatoryReportRecord"("status", "generatedAt");

-- CreateIndex
CREATE INDEX "GovernanceVendor_criticality_riskRating_idx" ON "GovernanceVendor"("criticality", "riskRating");

-- CreateIndex
CREATE INDEX "GovernanceVendor_status_idx" ON "GovernanceVendor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceVendor_vendorName_key" ON "GovernanceVendor"("vendorName");

-- CreateIndex
CREATE INDEX "ContinuityTestRecord_testDate_idx" ON "ContinuityTestRecord"("testDate");

-- CreateIndex
CREATE INDEX "ContinuityTestRecord_result_testDate_idx" ON "ContinuityTestRecord"("result", "testDate");
