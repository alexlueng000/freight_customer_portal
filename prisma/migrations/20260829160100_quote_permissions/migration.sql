INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('quote-create-permission', 'quote.create', 'Create a customer quote from a rate', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('quote-read-permission', 'quote.read', 'View quotes within the permitted customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('quote.create', 'quote.read')
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'CUSTOMER_ADMIN', 'CUSTOMER_USER')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'quote.read'
WHERE role."code" = 'SALES'
ON CONFLICT DO NOTHING;
