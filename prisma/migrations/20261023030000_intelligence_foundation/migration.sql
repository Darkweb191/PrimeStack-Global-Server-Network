CREATE TABLE "IntelligenceEvent" (
    "id" TEXT NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "sourceSystem" VARCHAR(100) NOT NULL,
    "confidenceScore" DECIMAL(5,2) NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntelligenceEvent_confidenceScore_range" CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 100)
);

CREATE INDEX "IntelligenceEvent_createdAt_idx" ON "IntelligenceEvent"("createdAt");
CREATE INDEX "IntelligenceEvent_eventType_createdAt_idx" ON "IntelligenceEvent"("eventType", "createdAt");
CREATE INDEX "IntelligenceEvent_sourceSystem_createdAt_idx" ON "IntelligenceEvent"("sourceSystem", "createdAt");
CREATE INDEX "IntelligenceEvent_createdBy_createdAt_idx" ON "IntelligenceEvent"("createdBy", "createdAt");
