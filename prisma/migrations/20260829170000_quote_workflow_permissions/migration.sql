INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('quote-manage-permission', 'quote.manage', 'Manage and send tenant quotes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('quote-accept-permission', 'quote.accept', 'Accept quotes within the customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('quote-reject-permission', 'quote.reject', 'Reject quotes within the customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'quote.manage'
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'SALES') ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('quote.accept', 'quote.reject')
WHERE role."code" IN ('CUSTOMER_ADMIN', 'CUSTOMER_USER') ON CONFLICT DO NOTHING;
