CREATE TYPE "RateImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "RateImportJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "originalFileName" VARCHAR(255) NOT NULL,
  "status" "RateImportStatus" NOT NULL DEFAULT 'PENDING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "errorMessage" VARCHAR(1000),
  "createdById" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RateImportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RateImportJob_counts_check" CHECK ("totalRows" >= 0 AND "successRows" >= 0 AND "failedRows" >= 0)
);

CREATE INDEX "RateImportJob_tenantId_status_createdAt_idx" ON "RateImportJob"("tenantId", "status", "createdAt");
CREATE INDEX "RateImportJob_tenantId_createdById_createdAt_idx" ON "RateImportJob"("tenantId", "createdById", "createdAt");
ALTER TABLE "RateImportJob" ADD CONSTRAINT "RateImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
