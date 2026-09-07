ALTER TABLE "Booking"
ADD COLUMN "serviceName" VARCHAR(200),
ADD COLUMN "incoterm" VARCHAR(10),
ADD COLUMN "requestedServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "pickupLocationText" VARCHAR(1000),
ADD COLUMN "deliveryLocationText" VARCHAR(1000);

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_incoterm_check"
CHECK (
  "incoterm" IS NULL OR
  "incoterm" IN ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'OTHER')
);

CREATE TABLE "BookingCargoItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "sourceQuoteCargoItemId" TEXT,
  "commodity" VARCHAR(500) NOT NULL,
  "estimatedGrossWeight" DECIMAL(18,3),
  "cargoNature" VARCHAR(200),
  "specialRequirement" VARCHAR(2000),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BookingCargoItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BookingCargoItem"
ADD CONSTRAINT "BookingCargoItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BookingCargoItem"
ADD CONSTRAINT "BookingCargoItem_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingCargoItem"
ADD CONSTRAINT "BookingCargoItem_sourceQuoteCargoItemId_fkey"
FOREIGN KEY ("sourceQuoteCargoItemId") REFERENCES "QuoteCargoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingCargoItem"
ADD CONSTRAINT "BookingCargoItem_estimatedGrossWeight_check"
CHECK ("estimatedGrossWeight" IS NULL OR "estimatedGrossWeight" > 0);

CREATE UNIQUE INDEX "BookingCargoItem_bookingId_sourceQuoteCargoItemId_key"
ON "BookingCargoItem"("bookingId", "sourceQuoteCargoItemId");

CREATE INDEX "BookingCargoItem_tenantId_bookingId_sortOrder_idx"
ON "BookingCargoItem"("tenantId", "bookingId", "sortOrder");

CREATE INDEX "BookingCargoItem_tenantId_sourceQuoteCargoItemId_idx"
ON "BookingCargoItem"("tenantId", "sourceQuoteCargoItemId");
