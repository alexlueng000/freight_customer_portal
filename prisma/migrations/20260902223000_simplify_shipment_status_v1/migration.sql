ALTER TYPE "ShipmentStatus" RENAME TO "ShipmentStatus_old";

CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNED', 'DEPARTED', 'ARRIVED', 'CANCELLED');

ALTER TABLE "Shipment" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Shipment"
  ALTER COLUMN "status" TYPE "ShipmentStatus"
  USING (
    CASE "status"::text
      WHEN 'CREATED' THEN 'PLANNED'
      WHEN 'BOOKED' THEN 'PLANNED'
      WHEN 'IN_TRANSIT' THEN 'DEPARTED'
      WHEN 'COMPLETED' THEN 'ARRIVED'
      ELSE "status"::text
    END
  )::"ShipmentStatus";

ALTER TABLE "Shipment" ALTER COLUMN "status" SET DEFAULT 'PLANNED';

DROP TYPE "ShipmentStatus_old";
