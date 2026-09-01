CREATE TYPE "BookingStatus_new" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'REVISION_REQUIRED',
  'APPROVED',
  'BOOKING_SUBMITTED',
  'BOOKED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus_new" USING (
  CASE "status"::text
    WHEN 'UNDER_REVIEW' THEN 'SUBMITTED'
    WHEN 'CONFIRMED' THEN 'APPROVED'
    WHEN 'SO_RELEASED' THEN 'BOOKED'
    ELSE "status"::text
  END
)::"BookingStatus_new";
DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

CREATE TYPE "BookingReviewActionType" AS ENUM (
  'APPROVE',
  'REQUEST_REVISION',
  'REJECT',
  'SUBMIT_TO_CARRIER',
  'CANCEL'
);

CREATE TYPE "BookingRevisionReasonCode" AS ENUM (
  'CARGO_INCOMPLETE',
  'SHIPPER_INCOMPLETE',
  'CONTACT_INCOMPLETE',
  'CARGO_READY_DATE_INVALID',
  'CARGO_CONTAINER_CONFLICT',
  'DANGEROUS_GOODS_INFO_REQUIRED',
  'OTHER'
);

ALTER TABLE "Booking"
  ADD COLUMN "revisionRequestedAt" TIMESTAMPTZ(3),
  ADD COLUMN "approvedAt" TIMESTAMPTZ(3),
  ADD COLUMN "bookingSubmittedAt" TIMESTAMPTZ(3),
  ADD COLUMN "bookedAt" TIMESTAMPTZ(3);

UPDATE "Booking"
SET "approvedAt" = COALESCE("confirmedAt", "updatedAt")
WHERE "status" = 'APPROVED';

UPDATE "Booking" b
SET "bookedAt" = COALESCE(
  (
    SELECT MIN(d."createdAt")
    FROM "Document" d
    WHERE d."bookingId" = b.id
      AND d."tenantId" = b."tenantId"
      AND d."documentType" = 'SO'
      AND d.status = 'ACTIVE'
      AND d."customerVisible" = true
  ),
  b."confirmedAt",
  b."updatedAt"
)
WHERE b.status = 'BOOKED';

CREATE TABLE "BookingReviewAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "action" "BookingReviewActionType" NOT NULL,
  "reasonCode" "BookingRevisionReasonCode",
  "customerVisibleRemark" VARCHAR(1000),
  "internalRemark" VARCHAR(1000),
  "carrierSourceName" VARCHAR(200),
  "carrierReference" VARCHAR(200),
  "actorUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingReviewAction_tenantId_bookingId_createdAt_idx"
  ON "BookingReviewAction"("tenantId", "bookingId", "createdAt");
CREATE INDEX "BookingReviewAction_tenantId_action_createdAt_idx"
  ON "BookingReviewAction"("tenantId", "action", "createdAt");

ALTER TABLE "BookingReviewAction" ADD CONSTRAINT "BookingReviewAction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingReviewAction" ADD CONSTRAINT "BookingReviewAction_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingReviewAction" ADD CONSTRAINT "BookingReviewAction_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_booking_review_action_tenant_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b.id = NEW."bookingId" AND b."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'BookingReviewAction booking tenant mismatch'; END IF;
  IF NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u.id = NEW."actorUserId" AND u."tenantId" = NEW."tenantId"
  ) THEN RAISE EXCEPTION 'BookingReviewAction actor tenant mismatch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER booking_review_action_tenant_consistency
BEFORE INSERT OR UPDATE ON "BookingReviewAction"
FOR EACH ROW EXECUTE FUNCTION enforce_booking_review_action_tenant_consistency();
