CREATE UNIQUE INDEX "BookingSoRecord_one_published_per_booking"
ON "BookingSoRecord"("tenantId", "bookingId")
WHERE "status" = 'PUBLISHED';
