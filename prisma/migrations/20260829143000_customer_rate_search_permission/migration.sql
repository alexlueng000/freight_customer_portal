INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES ('rate-search-permission', 'rate.search', 'Search customer-visible freight rate sell prices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'rate.search'
WHERE role."code" IN ('CUSTOMER_ADMIN', 'CUSTOMER_USER')
ON CONFLICT DO NOTHING;
