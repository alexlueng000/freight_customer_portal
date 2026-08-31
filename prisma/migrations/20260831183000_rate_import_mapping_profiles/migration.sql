CREATE TABLE "RateImportMappingProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "supplierName" VARCHAR(200),
  "sheetName" VARCHAR(120) NOT NULL,
  "headerRow" INTEGER NOT NULL,
  "headerDepth" INTEGER NOT NULL DEFAULT 1,
  "mappings" JSONB NOT NULL,
  "sourceFingerprint" VARCHAR(128),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "RateImportMappingProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RateImportMappingProfile_header_check" CHECK ("headerRow" > 0 AND "headerDepth" IN (1, 2))
);

CREATE UNIQUE INDEX "RateImportMappingProfile_tenantId_name_key"
  ON "RateImportMappingProfile"("tenantId", "name");
CREATE INDEX "RateImportMappingProfile_tenantId_supplierName_updatedAt_idx"
  ON "RateImportMappingProfile"("tenantId", "supplierName", "updatedAt");

ALTER TABLE "RateImportMappingProfile"
  ADD CONSTRAINT "RateImportMappingProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
