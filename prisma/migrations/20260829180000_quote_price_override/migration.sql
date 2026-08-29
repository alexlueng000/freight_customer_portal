ALTER TABLE "Quote" ADD COLUMN "priceOverriddenAt" TIMESTAMPTZ(3),
ADD COLUMN "priceOverriddenById" TEXT,
ADD COLUMN "priceOverrideReason" VARCHAR(500);
ALTER TABLE "QuoteItem" ADD COLUMN "originalUnitPrice" DECIMAL(18,4);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_priceOverriddenById_fkey" FOREIGN KEY ("priceOverriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Quote_tenantId_priceOverriddenById_idx" ON "Quote"("tenantId", "priceOverriddenById");
