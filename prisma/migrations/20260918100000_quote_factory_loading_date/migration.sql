-- Customer's planned factory loading date is separate from vessel ETD.
-- Historical quotes keep NULL; no date is inferred from another business event.
ALTER TABLE "Quote" ADD COLUMN "factoryLoadingDate" DATE;
