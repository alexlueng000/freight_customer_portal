ALTER TABLE "Quote"
ADD COLUMN "pickupAddress" VARCHAR(1000),
ADD COLUMN "deliveryAddress" VARCHAR(1000),
ADD COLUMN "requestedServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "QuoteCargoItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "commodity" VARCHAR(500) NOT NULL,
  "grossWeightKg" DECIMAL(18,3) NOT NULL,
  "specialRequirements" VARCHAR(2000),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteCargoItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuoteCargoItem"
ADD CONSTRAINT "QuoteCargoItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuoteCargoItem"
ADD CONSTRAINT "QuoteCargoItem_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "QuoteCargoItem_tenantId_quoteId_sortOrder_idx"
ON "QuoteCargoItem"("tenantId", "quoteId", "sortOrder");

-- Existing quotes predate collection of cargo details. New quotes require at least
-- one cargo item at the API boundary while historical quotes keep an empty list.
