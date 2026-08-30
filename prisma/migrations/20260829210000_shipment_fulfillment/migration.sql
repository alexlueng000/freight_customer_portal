CREATE TYPE "EventSourceType" AS ENUM ('MANUAL', 'API', 'SYSTEM');

ALTER TABLE "Shipment"
  ADD COLUMN "atd" TIMESTAMPTZ(3),
  ADD COLUMN "ata" TIMESTAMPTZ(3),
  ADD COLUMN "mblNo" VARCHAR(100),
  ADD COLUMN "hblNo" VARCHAR(100),
  ADD COLUMN "completedAt" TIMESTAMPTZ(3);

CREATE TABLE "Container" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "containerNo" VARCHAR(20) NOT NULL,
  "containerType" VARCHAR(20) NOT NULL,
  "sealNo" VARCHAR(50),
  "vgmWeight" DECIMAL(18,4),
  "pickupAt" TIMESTAMPTZ(3),
  "gateInAt" TIMESTAMPTZ(3),
  "loadedAt" TIMESTAMPTZ(3),
  "dischargedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Container_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Container_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "Container_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE,
  CONSTRAINT "Container_vgmWeight_check" CHECK ("vgmWeight" IS NULL OR "vgmWeight" >= 0)
);

CREATE UNIQUE INDEX "Container_tenantId_shipmentId_containerNo_key" ON "Container"("tenantId", "shipmentId", "containerNo");
CREATE INDEX "Container_tenantId_containerNo_idx" ON "Container"("tenantId", "containerNo");
CREATE INDEX "Container_tenantId_shipmentId_idx" ON "Container"("tenantId", "shipmentId");

CREATE TABLE "TrackingEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "eventType" VARCHAR(50) NOT NULL,
  "eventTime" TIMESTAMPTZ(3) NOT NULL,
  "locationCode" VARCHAR(10),
  "locationName" VARCHAR(150),
  "remark" VARCHAR(500),
  "sourceType" "EventSourceType" NOT NULL DEFAULT 'MANUAL',
  "customerVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "TrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE,
  CONSTRAINT "TrackingEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "TrackingEvent_tenantId_shipmentId_eventTime_idx" ON "TrackingEvent"("tenantId", "shipmentId", "eventTime");
CREATE INDEX "TrackingEvent_tenantId_eventType_eventTime_idx" ON "TrackingEvent"("tenantId", "eventType", "eventTime");

CREATE OR REPLACE FUNCTION enforce_shipment_child_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s."id" = NEW."shipmentId" AND s."tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'shipment child tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Container_tenant_guard" BEFORE INSERT OR UPDATE ON "Container"
FOR EACH ROW EXECUTE FUNCTION enforce_shipment_child_tenant();
CREATE TRIGGER "TrackingEvent_tenant_guard" BEFORE INSERT OR UPDATE ON "TrackingEvent"
FOR EACH ROW EXECUTE FUNCTION enforce_shipment_child_tenant();

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt") VALUES
  ('perm_shipment_manage', 'shipment.manage', 'Manage shipment details and lifecycle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_tracking_manage', 'tracking.manage', 'Create shipment tracking events', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_document_manage', 'document.manage', 'Manage shipment document visibility and versions', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code" IN ('SUPER_ADMIN','TENANT_ADMIN','OPERATION') AND p."code" IN ('shipment.manage','tracking.manage','document.manage'))
ON CONFLICT DO NOTHING;
