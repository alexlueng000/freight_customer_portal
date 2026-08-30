ALTER TABLE "Document" DROP CONSTRAINT "Document_parent_check";
ALTER TABLE "Document" ADD CONSTRAINT "Document_parent_check" CHECK (
  (("bookingId" IS NOT NULL)::int +
   ("shipmentId" IS NOT NULL)::int +
   ("invoiceId" IS NOT NULL)::int) = 1
);
