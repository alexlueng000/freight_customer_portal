CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DEPARTED', 'ARRIVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentNo" VARCHAR(50) NOT NULL,
  "bookingId" TEXT NOT NULL,
  "customerCompanyId" TEXT NOT NULL,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PLANNED',
  "carrierCode" VARCHAR(20),
  "vessel" VARCHAR(100),
  "voyage" VARCHAR(50),
  "polCode" VARCHAR(10) NOT NULL,
  "podCode" VARCHAR(10) NOT NULL,
  "etd" TIMESTAMPTZ(3),
  "eta" TIMESTAMPTZ(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT,
  "shipmentId" TEXT,
  "documentType" VARCHAR(50) NOT NULL,
  "objectKey" VARCHAR(1000) NOT NULL,
  "originalFilename" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(150) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "Document_parent_check" CHECK ("bookingId" IS NOT NULL OR "shipmentId" IS NOT NULL),
  CONSTRAINT "Document_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "Shipment_tenantId_shipmentNo_key" ON "Shipment"("tenantId", "shipmentNo");
CREATE INDEX "Shipment_tenantId_customerCompanyId_status_idx" ON "Shipment"("tenantId", "customerCompanyId", "status");
CREATE INDEX "Shipment_tenantId_bookingId_idx" ON "Shipment"("tenantId", "bookingId");
CREATE UNIQUE INDEX "Document_objectKey_key" ON "Document"("objectKey");
CREATE UNIQUE INDEX "Document_tenantId_bookingId_documentType_version_key" ON "Document"("tenantId", "bookingId", "documentType", "version");
CREATE INDEX "Document_tenantId_shipmentId_documentType_status_idx" ON "Document"("tenantId", "shipmentId", "documentType", "status");
CREATE INDEX "Document_tenantId_bookingId_documentType_status_idx" ON "Document"("tenantId", "bookingId", "documentType", "status");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_shipment_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = NEW."bookingId" AND b."tenantId" = NEW."tenantId" AND b."customerCompanyId" = NEW."customerCompanyId") THEN RAISE EXCEPTION 'Shipment booking tenant/customer mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_tenant_consistency BEFORE INSERT OR UPDATE ON "Shipment" FOR EACH ROW EXECUTE FUNCTION enforce_shipment_tenant_consistency();

CREATE OR REPLACE FUNCTION enforce_document_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NEW."bookingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id = NEW."bookingId" AND b."tenantId" = NEW."tenantId") THEN RAISE EXCEPTION 'Document booking tenant mismatch'; END IF;
  IF NEW."shipmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s.id = NEW."shipmentId" AND s."tenantId" = NEW."tenantId") THEN RAISE EXCEPTION 'Document shipment tenant mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER document_tenant_consistency BEFORE INSERT OR UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION enforce_document_tenant_consistency();
