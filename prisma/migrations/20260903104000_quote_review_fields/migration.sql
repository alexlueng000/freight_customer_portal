ALTER TABLE "Quote"
ADD COLUMN "customerTerms" VARCHAR(2000),
ADD COLUMN "internalNote" VARCHAR(2000),
ADD COLUMN "sentAt" TIMESTAMPTZ(3),
ADD COLUMN "sentById" TEXT;

CREATE INDEX "Quote_tenantId_sentById_idx" ON "Quote"("tenantId", "sentById");

ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
