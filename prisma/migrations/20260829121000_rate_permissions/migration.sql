INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('rate-read-permission', 'rate.read', 'View tenant freight rates', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rate-manage-permission', 'rate.manage', 'Create and manage tenant freight rates', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'rate.read'
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'rate.manage'
WHERE role."code" IN ('SUPER_ADMIN', 'TENANT_ADMIN')
ON CONFLICT DO NOTHING;
