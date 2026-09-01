CREATE TYPE "PackageType" AS ENUM ('CARTON', 'PALLET', 'CASE', 'BAG', 'DRUM', 'PACKAGE', 'OTHER');
CREATE TYPE "CustomerShipperStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "CustomerShipper" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerCompanyId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "address" VARCHAR(1000) NOT NULL,
  "contactName" VARCHAR(150),
  "contactEmail" VARCHAR(320),
  "contactPhone" VARCHAR(50),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "CustomerShipperStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomerShipper_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Booking"
  ADD COLUMN "packageType" "PackageType",
  ADD COLUMN "cargoReadyDate" DATE,
  ADD COLUMN "specialInstructions" VARCHAR(2000),
  ADD COLUMN "sourceShipperId" TEXT;

CREATE INDEX "CustomerShipper_tenantId_customerCompanyId_status_idx" ON "CustomerShipper"("tenantId", "customerCompanyId", "status");
CREATE INDEX "CustomerShipper_tenantId_customerCompanyId_isDefault_idx" ON "CustomerShipper"("tenantId", "customerCompanyId", "isDefault");
CREATE INDEX "Booking_tenantId_sourceShipperId_idx" ON "Booking"("tenantId", "sourceShipperId");

ALTER TABLE "CustomerShipper" ADD CONSTRAINT "CustomerShipper_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerShipper" ADD CONSTRAINT "CustomerShipper_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sourceShipperId_fkey" FOREIGN KEY ("sourceShipperId") REFERENCES "CustomerShipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CustomerShipper_one_default_per_customer"
ON "CustomerShipper"("tenantId", "customerCompanyId") WHERE "isDefault" = true AND "status" = 'ACTIVE';

CREATE OR REPLACE FUNCTION enforce_customer_shipper_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "CustomerCompany" c
    WHERE c.id = NEW."customerCompanyId" AND c."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'CustomerShipper customer tenant mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER customer_shipper_tenant_consistency BEFORE INSERT OR UPDATE ON "CustomerShipper" FOR EACH ROW EXECUTE FUNCTION enforce_customer_shipper_tenant_consistency();

CREATE OR REPLACE FUNCTION enforce_booking_source_shipper_consistency() RETURNS trigger AS $$
BEGIN
  IF NEW."sourceShipperId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CustomerShipper" s
    WHERE s.id = NEW."sourceShipperId"
      AND s."tenantId" = NEW."tenantId"
      AND s."customerCompanyId" = NEW."customerCompanyId"
  ) THEN RAISE EXCEPTION 'Booking source shipper tenant/customer mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_source_shipper_consistency BEFORE INSERT OR UPDATE OF "sourceShipperId", "tenantId", "customerCompanyId" ON "Booking" FOR EACH ROW EXECUTE FUNCTION enforce_booking_source_shipper_consistency();
