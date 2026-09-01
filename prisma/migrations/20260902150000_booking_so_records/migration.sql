CREATE TYPE "BookingSoRecordStatus" AS ENUM ('INTERNAL_DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "BookingSoSourceType" AS ENUM ('CARRIER', 'AGENT', 'OTHER');

CREATE TABLE "BookingSoRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "soNumber" VARCHAR(100) NOT NULL,
  "sourceType" "BookingSoSourceType" NOT NULL,
  "sourceName" VARCHAR(200),
  "carrierCode" VARCHAR(20),
  "vessel" VARCHAR(100),
  "voyage" VARCHAR(50),
  "etd" TIMESTAMPTZ(3),
  "eta" TIMESTAMPTZ(3),
  "cyCutoffAt" TIMESTAMPTZ(3),
  "siCutoffAt" TIMESTAMPTZ(3),
  "vgmCutoffAt" TIMESTAMPTZ(3),
  "terminal" VARCHAR(300),
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "BookingSoRecordStatus" NOT NULL DEFAULT 'INTERNAL_DRAFT',
  "uploadedById" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BookingSoRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingSoRecord_documentId_key" ON "BookingSoRecord"("documentId");
CREATE UNIQUE INDEX "BookingSoRecord_tenantId_bookingId_version_key" ON "BookingSoRecord"("tenantId", "bookingId", "version");
CREATE INDEX "BookingSoRecord_tenantId_bookingId_status_version_idx" ON "BookingSoRecord"("tenantId", "bookingId", "status", "version");
CREATE INDEX "BookingSoRecord_tenantId_soNumber_idx" ON "BookingSoRecord"("tenantId", "soNumber");

ALTER TABLE "BookingSoRecord" ADD CONSTRAINT "BookingSoRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSoRecord" ADD CONSTRAINT "BookingSoRecord_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSoRecord" ADD CONSTRAINT "BookingSoRecord_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSoRecord" ADD CONSTRAINT "BookingSoRecord_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingSoRecord" ADD CONSTRAINT "BookingSoRecord_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_booking_so_record_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b.id = NEW."bookingId" AND b."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'BookingSoRecord booking tenant mismatch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d.id = NEW."documentId" AND d."tenantId" = NEW."tenantId" AND d."bookingId" = NEW."bookingId"
  ) THEN RAISE EXCEPTION 'BookingSoRecord document tenant/booking mismatch'; END IF;
  IF NEW."uploadedById" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = NEW."uploadedById" AND u."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'BookingSoRecord uploader tenant mismatch'; END IF;
  IF NEW."publishedById" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" u WHERE u.id = NEW."publishedById" AND u."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'BookingSoRecord publisher tenant mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER booking_so_record_tenant_consistency
BEFORE INSERT OR UPDATE ON "BookingSoRecord"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_so_record_tenant_consistency();

INSERT INTO "BookingSoRecord" (
  "id", "tenantId", "bookingId", "documentId", "soNumber", "sourceType",
  "carrierCode", "receivedAt", "version", "status", "uploadedById",
  "publishedById", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_so_' || md5(d.id),
  d."tenantId",
  d."bookingId",
  d.id,
  LEFT('LEGACY-' || d."originalFilename", 100),
  'OTHER'::"BookingSoSourceType",
  b."carrierCode",
  d."createdAt",
  d.version,
  'PUBLISHED'::"BookingSoRecordStatus",
  d."uploadedById",
  d."uploadedById",
  d."createdAt",
  d."createdAt",
  d."createdAt"
FROM "Document" d
JOIN "Booking" b ON b.id = d."bookingId" AND b."tenantId" = d."tenantId"
WHERE d."documentType" = 'SO'
  AND d.status = 'ACTIVE'
  AND d."customerVisible" = true
  AND d."bookingId" IS NOT NULL;
