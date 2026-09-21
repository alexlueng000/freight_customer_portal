-- Internal quote review plan, independent of source ETD and factory loading date.
-- Existing quotes remain unset; this date does not confirm a booking.
ALTER TABLE "Quote" ADD COLUMN "plannedSailingDate" DATE;
