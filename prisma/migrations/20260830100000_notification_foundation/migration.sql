CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipient" VARCHAR(320) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000),
    "sentAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_tenantId_recipientUserId_channel_createdAt_idx"
ON "Notification"("tenantId", "recipientUserId", "channel", "createdAt");
CREATE INDEX "Notification_tenantId_status_createdAt_idx"
ON "Notification"("tenantId", "status", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_notification_tenant_consistency()
RETURNS trigger AS $$
BEGIN
  IF NEW."recipientUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = NEW."recipientUserId" AND u."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Notification recipient user must belong to the same tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_tenant_consistency
BEFORE INSERT OR UPDATE OF "tenantId", "recipientUserId" ON "Notification"
FOR EACH ROW EXECUTE FUNCTION enforce_notification_tenant_consistency();
