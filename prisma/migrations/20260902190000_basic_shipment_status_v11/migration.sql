ALTER TYPE "ShipmentStatus" RENAME TO "ShipmentStatus_old";

CREATE TYPE "ShipmentStatus" AS ENUM (
  'CREATED',
  'BOOKED',
  'DEPARTED',
  'IN_TRANSIT',
  'ARRIVED',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Shipment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Shipment"
  ALTER COLUMN "status" TYPE "ShipmentStatus"
  USING (
    CASE "status"::text
      WHEN 'PLANNED' THEN 'CREATED'
      WHEN 'IN_PROGRESS' THEN 'BOOKED'
      ELSE "status"::text
    END
  )::"ShipmentStatus";

ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'CREATED';

DROP TYPE "ShipmentStatus_old";
