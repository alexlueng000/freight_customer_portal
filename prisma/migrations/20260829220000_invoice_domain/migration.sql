CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CUSTOMER_CONFIRMED', 'PAID', 'VOID');

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invoiceNo" VARCHAR(50) NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "customerCompanyId" TEXT NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "subtotal" DECIMAL(18,4) NOT NULL,
  "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,4) NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "issuedAt" TIMESTAMPTZ(3),
  "confirmedAt" TIMESTAMPTZ(3),
  "paidAt" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "Invoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT,
  CONSTRAINT "Invoice_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT,
  CONSTRAINT "Invoice_amounts_check" CHECK ("subtotal" >= 0 AND "taxAmount" >= 0 AND "totalAmount" = "subtotal" + "taxAmount"),
  CONSTRAINT "Invoice_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "InvoiceLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE,
  CONSTRAINT "InvoiceLine_amounts_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" = "quantity" * "unitPrice")
);

CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNo_key" ON "Invoice"("tenantId", "invoiceNo");
CREATE INDEX "Invoice_tenantId_customerCompanyId_status_idx" ON "Invoice"("tenantId", "customerCompanyId", "status");
CREATE INDEX "Invoice_tenantId_shipmentId_idx" ON "Invoice"("tenantId", "shipmentId");
CREATE INDEX "Invoice_tenantId_dueDate_status_idx" ON "Invoice"("tenantId", "dueDate", "status");
CREATE INDEX "InvoiceLine_tenantId_invoiceId_idx" ON "InvoiceLine"("tenantId", "invoiceId");

CREATE OR REPLACE FUNCTION enforce_invoice_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s."id" = NEW."shipmentId" AND s."tenantId" = NEW."tenantId" AND s."customerCompanyId" = NEW."customerCompanyId") THEN
    RAISE EXCEPTION 'invoice tenant or customer mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Invoice_tenant_guard" BEFORE INSERT OR UPDATE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_tenant();

CREATE OR REPLACE FUNCTION enforce_invoice_line_tenant() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."id" = NEW."invoiceId" AND i."tenantId" = NEW."tenantId") THEN
    RAISE EXCEPTION 'invoice line tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InvoiceLine_tenant_guard" BEFORE INSERT OR UPDATE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_line_tenant();

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt") VALUES
  ('perm_invoice_read', 'invoice.read', 'View invoices within the permitted customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_invoice_manage', 'invoice.manage', 'Create, issue, void, and mark invoices paid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_invoice_confirm', 'invoice.confirm', 'Confirm issued invoices within the customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code" IN ('SUPER_ADMIN','TENANT_ADMIN','FINANCE') AND p."code" IN ('invoice.read','invoice.manage'))
   OR (r."code" = 'SALES' AND p."code" = 'invoice.read')
   OR (r."code" IN ('CUSTOMER_ADMIN','CUSTOMER_USER') AND p."code" IN ('invoice.read','invoice.confirm'))
ON CONFLICT DO NOTHING;
