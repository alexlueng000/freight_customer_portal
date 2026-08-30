ALTER TABLE "Document" ADD COLUMN "invoiceId" TEXT;

CREATE UNIQUE INDEX "Document_tenantId_invoiceId_documentType_version_key"
ON "Document"("tenantId", "invoiceId", "documentType", "version");
CREATE INDEX "Document_tenantId_invoiceId_documentType_status_idx"
ON "Document"("tenantId", "invoiceId", "documentType", "status");

ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_invoice_document_tenant_consistency()
RETURNS trigger AS $$
BEGIN
  IF NEW."invoiceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Invoice" i
    WHERE i."id" = NEW."invoiceId" AND i."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Document invoice must belong to the same tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_document_tenant_consistency
BEFORE INSERT OR UPDATE OF "tenantId", "invoiceId" ON "Document"
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_document_tenant_consistency();
