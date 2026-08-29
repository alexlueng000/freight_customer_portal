CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED', 'SO_RELEASED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingNo" VARCHAR(50) NOT NULL,
  "quoteId" TEXT,
  "customerCompanyId" TEXT NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
  "polCode" VARCHAR(10) NOT NULL,
  "podCode" VARCHAR(10) NOT NULL,
  "carrierCode" VARCHAR(20),
  "etd" TIMESTAMPTZ(3),
  "commodity" VARCHAR(300),
  "packages" INTEGER,
  "grossWeight" DECIMAL(18,4),
  "volumeCbm" DECIMAL(18,4),
  "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
  "shipperName" VARCHAR(200),
  "shipperAddress" VARCHAR(1000),
  "bookingContactName" VARCHAR(150),
  "bookingContactEmail" VARCHAR(320),
  "bookingContactPhone" VARCHAR(50),
  "lastStatusRemark" VARCHAR(500),
  "submittedAt" TIMESTAMPTZ(3),
  "underReviewAt" TIMESTAMPTZ(3),
  "confirmedAt" TIMESTAMPTZ(3),
  "rejectedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_packages_check" CHECK ("packages" IS NULL OR "packages" > 0),
  CONSTRAINT "Booking_grossWeight_check" CHECK ("grossWeight" IS NULL OR "grossWeight" > 0),
  CONSTRAINT "Booking_volumeCbm_check" CHECK ("volumeCbm" IS NULL OR "volumeCbm" > 0)
);

CREATE TABLE "BookingContainerRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "containerType" VARCHAR(20) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "weightPerContainer" DECIMAL(18,4),
  "remark" VARCHAR(500),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BookingContainerRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingContainerRequest_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "BookingContainerRequest_weight_check" CHECK ("weightPerContainer" IS NULL OR "weightPerContainer" > 0)
);

CREATE UNIQUE INDEX "Booking_tenantId_bookingNo_key" ON "Booking"("tenantId", "bookingNo");
CREATE INDEX "Booking_tenantId_customerCompanyId_status_idx" ON "Booking"("tenantId", "customerCompanyId", "status");
CREATE INDEX "Booking_tenantId_quoteId_idx" ON "Booking"("tenantId", "quoteId");
CREATE INDEX "Booking_tenantId_createdAt_idx" ON "Booking"("tenantId", "createdAt");
CREATE UNIQUE INDEX "BookingContainerRequest_bookingId_containerType_key" ON "BookingContainerRequest"("bookingId", "containerType");
CREATE INDEX "BookingContainerRequest_tenantId_bookingId_idx" ON "BookingContainerRequest"("tenantId", "bookingId");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingContainerRequest" ADD CONSTRAINT "BookingContainerRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_booking_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CustomerCompany" c WHERE c.id = NEW."customerCompanyId" AND c."tenantId" = NEW."tenantId") THEN RAISE EXCEPTION 'Booking customer tenant mismatch'; END IF;
  IF NEW."quoteId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quote" q WHERE q.id = NEW."quoteId" AND q."tenantId" = NEW."tenantId" AND q."customerCompanyId" = NEW."customerCompanyId") THEN RAISE EXCEPTION 'Booking quote tenant/customer mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_tenant_consistency BEFORE INSERT OR UPDATE ON "Booking" FOR EACH ROW EXECUTE FUNCTION enforce_booking_tenant_consistency();

CREATE OR REPLACE FUNCTION enforce_booking_container_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = NEW."bookingId" AND b."tenantId" = NEW."tenantId") THEN RAISE EXCEPTION 'Booking container tenant mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_container_tenant_consistency BEFORE INSERT OR UPDATE ON "BookingContainerRequest" FOR EACH ROW EXECUTE FUNCTION enforce_booking_container_tenant_consistency();
