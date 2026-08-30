ALTER TABLE "InvoiceLine" ADD COLUMN "chargeCode" VARCHAR(50);
ALTER TABLE "InvoiceLine" ADD COLUMN "currency" VARCHAR(3);

UPDATE "InvoiceLine" line
SET
  "chargeCode" = 'OTHER',
  "currency" = invoice."currency"
FROM "Invoice" invoice
WHERE invoice."id" = line."invoiceId";

ALTER TABLE "InvoiceLine" ALTER COLUMN "chargeCode" SET NOT NULL;
ALTER TABLE "InvoiceLine" ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT "InvoiceLine_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
