-- Version allocation occurs under a tenant-scoped Booking row lock.
-- No historical snapshots are fabricated for existing bookings.
ALTER TABLE "Booking" ADD COLUMN "submissionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "BookingSubmission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "submittedById" TEXT NOT NULL,
  "submittedByName" VARCHAR(200) NOT NULL,
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "BookingSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingSubmission_version_check" CHECK ("version" > 0),
  CONSTRAINT "BookingSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingSubmission_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Supports tenant-scoped history pagination and guarantees one record per submitted version.
CREATE UNIQUE INDEX "BookingSubmission_tenantId_bookingId_version_key" ON "BookingSubmission"("tenantId", "bookingId", "version");
