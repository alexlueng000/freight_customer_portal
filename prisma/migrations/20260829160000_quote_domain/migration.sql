CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'BOOKED', 'EXPIRED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "quoteNo" VARCHAR(50) NOT NULL,
  "customerCompanyId" TEXT NOT NULL, "salesOwnerId" TEXT, "sourceRateId" TEXT,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT', "polCode" VARCHAR(10) NOT NULL,
  "podCode" VARCHAR(10) NOT NULL, "carrierCode" VARCHAR(20), "etd" TIMESTAMPTZ(3),
  "validUntil" DATE NOT NULL, "currency" VARCHAR(3) NOT NULL,
  "subtotal" DECIMAL(18,4) NOT NULL, "totalAmount" DECIMAL(18,4) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3), "bookedAt" TIMESTAMPTZ(3), "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT, "updatedById" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuoteItem" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "quoteId" TEXT NOT NULL,
  "chargeCode" VARCHAR(30) NOT NULL, "chargeName" VARCHAR(150) NOT NULL,
  "containerType" VARCHAR(20), "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(18,4) NOT NULL, "amount" DECIMAL(18,4) NOT NULL,
  "currency" VARCHAR(3) NOT NULL, "costAmount" DECIMAL(18,4), "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Quote_tenantId_quoteNo_key" ON "Quote"("tenantId", "quoteNo");
CREATE INDEX "Quote_tenantId_customerCompanyId_status_idx" ON "Quote"("tenantId", "customerCompanyId", "status");
CREATE INDEX "Quote_tenantId_validUntil_idx" ON "Quote"("tenantId", "validUntil");
CREATE INDEX "Quote_tenantId_sourceRateId_idx" ON "Quote"("tenantId", "sourceRateId");
CREATE INDEX "QuoteItem_tenantId_quoteId_idx" ON "QuoteItem"("tenantId", "quoteId");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_salesOwnerId_fkey" FOREIGN KEY ("salesOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sourceRateId_fkey" FOREIGN KEY ("sourceRateId") REFERENCES "Rate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
