-- Preserve the existing location and cargo snapshot data while adopting the
-- customer-facing Quote Request field names.
ALTER TABLE "Quote" RENAME COLUMN "pickupAddress" TO "pickupLocationText";
ALTER TABLE "Quote" RENAME COLUMN "deliveryAddress" TO "deliveryLocationText";

ALTER TABLE "Quote"
ADD COLUMN "containerQuantity" INTEGER,
ADD COLUMN "incoterm" VARCHAR(10),
ADD COLUMN "exportCustomsRemark" VARCHAR(1000),
ADD COLUMN "importCustomsRemark" VARCHAR(1000),
ADD COLUMN "customerRemarks" VARCHAR(2000);

-- Historical quotes predate the dedicated field. Recover it from the ocean
-- freight snapshot when that snapshot has an integral, positive quantity.
UPDATE "Quote" AS quote
SET "containerQuantity" = snapshot."quantity"::INTEGER
FROM (
  SELECT "quoteId", MIN("quantity") AS "quantity"
  FROM "QuoteItem"
  WHERE "chargeCode" = 'OCEAN_FREIGHT'
  GROUP BY "quoteId"
  HAVING COUNT(*) = 1
    AND MIN("quantity") > 0
    AND MIN("quantity") = trunc(MIN("quantity"))
) AS snapshot
WHERE snapshot."quoteId" = quote."id";

ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_containerQuantity_check"
CHECK ("containerQuantity" IS NULL OR "containerQuantity" BETWEEN 1 AND 999),
ADD CONSTRAINT "Quote_incoterm_check"
CHECK (
  "incoterm" IS NULL OR
  "incoterm" IN ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'OTHER')
);

-- Convert already persisted service requests to the new stable codes.
UPDATE "Quote"
SET "requestedServices" = ARRAY(
  SELECT DISTINCT CASE code
    WHEN 'ORIGIN_LOGISTICS' THEN 'ORIGIN_PICKUP'
    WHEN 'ORIGIN_CUSTOMS_CLEARANCE' THEN 'EXPORT_CUSTOMS'
    WHEN 'DESTINATION_CUSTOMS_CLEARANCE' THEN 'IMPORT_CUSTOMS'
    WHEN 'DESTINATION_LOGISTICS' THEN 'DESTINATION_DELIVERY'
    ELSE code
  END
  FROM unnest("requestedServices") AS requested_service(code)
)
WHERE "requestedServices" && ARRAY[
  'ORIGIN_LOGISTICS',
  'ORIGIN_CUSTOMS_CLEARANCE',
  'DESTINATION_CUSTOMS_CLEARANCE',
  'DESTINATION_LOGISTICS'
]::TEXT[];

ALTER TABLE "QuoteCargoItem" RENAME COLUMN "grossWeightKg" TO "estimatedGrossWeight";
ALTER TABLE "QuoteCargoItem" RENAME COLUMN "specialRequirements" TO "specialRequirement";

ALTER TABLE "QuoteCargoItem"
ALTER COLUMN "estimatedGrossWeight" DROP NOT NULL,
ADD COLUMN "cargoNature" VARCHAR(200),
ADD CONSTRAINT "QuoteCargoItem_estimatedGrossWeight_check"
CHECK ("estimatedGrossWeight" IS NULL OR "estimatedGrossWeight" > 0);
