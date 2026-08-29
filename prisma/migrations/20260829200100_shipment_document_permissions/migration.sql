INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt") VALUES
  ('perm_shipment_create', 'shipment.create', 'Create shipments from confirmed bookings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_shipment_read', 'shipment.read', 'View shipments within the permitted customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_document_upload', 'document.upload', 'Upload shipment and booking documents', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_document_read', 'document.read', 'View and download authorized documents', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code" IN ('SUPER_ADMIN','TENANT_ADMIN') AND p."code" IN ('shipment.create','shipment.read','document.upload','document.read'))
   OR (r."code" = 'OPERATION' AND p."code" IN ('shipment.create','shipment.read','document.upload','document.read'))
   OR (r."code" IN ('SALES','FINANCE') AND p."code" IN ('shipment.read','document.read'))
   OR (r."code" IN ('CUSTOMER_ADMIN','CUSTOMER_USER') AND p."code" IN ('shipment.read','document.read'))
ON CONFLICT DO NOTHING;
