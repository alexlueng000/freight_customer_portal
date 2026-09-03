INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'rate.read'
WHERE role."code" = 'SALES'
ON CONFLICT DO NOTHING;
