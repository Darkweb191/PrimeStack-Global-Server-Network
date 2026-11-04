CREATE TABLE "BankAccountProfile" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "encryptedDetails" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankAccountProfile_bankName_idx" ON "BankAccountProfile"("bankName");
CREATE INDEX "BankAccountProfile_createdAt_idx" ON "BankAccountProfile"("createdAt");
