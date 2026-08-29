INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt") VALUES
  ('perm_booking_create', 'booking.create', 'Create and edit draft bookings from accepted quotes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_booking_read', 'booking.read', 'View bookings within the permitted customer scope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_booking_submit', 'booking.submit', 'Submit or cancel customer bookings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_booking_manage', 'booking.manage', 'Review, confirm, reject, or cancel tenant bookings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code" IN ('SUPER_ADMIN','TENANT_ADMIN') AND p."code" IN ('booking.create','booking.read','booking.submit','booking.manage'))
   OR (r."code" = 'SALES' AND p."code" = 'booking.read')
   OR (r."code" = 'OPERATION' AND p."code" IN ('booking.read','booking.manage'))
   OR (r."code" IN ('CUSTOMER_ADMIN','CUSTOMER_USER') AND p."code" IN ('booking.create','booking.read','booking.submit'))
ON CONFLICT DO NOTHING;
