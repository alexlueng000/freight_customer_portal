import { createHash } from 'node:crypto';
import { PrismaClient, RoleCode } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  ['tenant.manage', 'Manage tenant settings and branding'],
  ['user.read', 'View internal tenant users'],
  ['user.manage', 'Create and manage internal tenant users'],
  ['customer.read', 'View customer companies and contacts'],
  ['customer.manage', 'Create and manage customer companies and contacts'],
  ['customer_user.read', 'View customer users within the permitted customer scope'],
  ['customer_user.manage', 'Create and manage users within the permitted customer scope'],
  ['audit.read', 'View tenant audit logs'],
  ['rate.read', 'View tenant freight rates'],
  ['rate.manage', 'Create and manage tenant freight rates'],
  ['rate.search', 'Search customer-visible freight rate sell prices'],
  ['quote.create', 'Create a customer quote from a rate'],
  ['quote.read', 'View quotes within the permitted customer scope'],
  ['quote.manage', 'Manage and send tenant quotes'],
  ['quote.accept', 'Accept quotes within the customer scope'],
  ['quote.reject', 'Reject quotes within the customer scope'],
  ['booking.create', 'Create and edit draft bookings from accepted quotes'],
  ['booking.read', 'View bookings within the permitted customer scope'],
  ['booking.submit', 'Submit or cancel customer bookings'],
  ['booking.manage', 'Review, confirm, reject, or cancel tenant bookings'],
  ['shipment.create', 'Create shipments from confirmed bookings'],
  ['shipment.read', 'View shipments within the permitted customer scope'],
  ['document.upload', 'Upload shipment and booking documents'],
  ['document.read', 'View and download authorized documents'],
];

const rolePermissions = {
  [RoleCode.SUPER_ADMIN]: permissions.map(([code]) => code),
  [RoleCode.TENANT_ADMIN]: permissions.map(([code]) => code),
  [RoleCode.SALES]: [
    'customer.read',
    'customer.manage',
    'customer_user.read',
    'quote.read',
    'quote.manage',
    'booking.read',
    'shipment.read',
    'document.read',
  ],
  [RoleCode.OPERATION]: [
    'customer.read',
    'customer_user.read',
    'booking.read',
    'booking.manage',
    'shipment.create',
    'shipment.read',
    'document.upload',
    'document.read',
  ],
  [RoleCode.FINANCE]: ['customer.read', 'shipment.read', 'document.read'],
  [RoleCode.CUSTOMER_ADMIN]: [
    'customer.read',
    'customer_user.read',
    'customer_user.manage',
    'rate.search',
    'quote.create',
    'quote.read',
    'quote.accept',
    'quote.reject',
    'booking.create',
    'booking.read',
    'booking.submit',
    'shipment.read',
    'document.read',
  ],
  [RoleCode.CUSTOMER_USER]: [
    'customer.read',
    'rate.search',
    'quote.create',
    'quote.read',
    'quote.accept',
    'quote.reject',
    'booking.create',
    'booking.read',
    'booking.submit',
    'shipment.read',
    'document.read',
  ],
};

const roleNames = {
  [RoleCode.SUPER_ADMIN]: 'Super Admin',
  [RoleCode.TENANT_ADMIN]: 'Tenant Admin',
  [RoleCode.SALES]: 'Sales',
  [RoleCode.OPERATION]: 'Operation',
  [RoleCode.FINANCE]: 'Finance',
  [RoleCode.CUSTOMER_ADMIN]: 'Customer Admin',
  [RoleCode.CUSTOMER_USER]: 'Customer User',
};

async function seedPermissions() {
  const records = new Map();

  for (const [code, description] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
    records.set(code, permission);
  }

  return records;
}

async function seedDemoTenant(permissionRecords) {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.info('Demo tenant skipped. Set SEED_DEMO_DATA=true to create local demo data.');
    return;
  }

  const tenant = await prisma.tenant.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: {
      code: 'DEMO',
      name: 'Demo Freight Forwarder',
      status: 'TRIAL',
      timezone: 'Asia/Shanghai',
      defaultCurrency: 'USD',
    },
  });

  const roleRecords = new Map();

  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name: roleNames[code], isSystem: true },
      create: {
        tenantId: tenant.id,
        code,
        name: roleNames[code],
        isSystem: true,
      },
    });
    roleRecords.set(code, role);

    for (const permissionCode of rolePermissions[code]) {
      const permission = permissionRecords.get(permissionCode);
      if (!permission) {
        throw new Error(`Missing permission definition: ${permissionCode}`);
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const pepper = requireDemoSecret('PASSWORD_HASH_PEPPER');
  const adminPassword = requireDemoSecret('DEMO_ADMIN_PASSWORD');
  const customerPassword = requireDemoSecret('DEMO_CUSTOMER_PASSWORD');
  const customerCompany = await prisma.customerCompany.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'NORTHSTAR' } },
    update: { name: 'Northstar Trading Co., Ltd.', status: 'ACTIVE' },
    create: {
      tenantId: tenant.id,
      code: 'NORTHSTAR',
      name: 'Northstar Trading Co., Ltd.',
      shortName: 'Northstar',
      countryCode: 'CN',
      status: 'ACTIVE',
    },
  });
  const admin = await upsertDemoUser({
    tenantId: tenant.id,
    email: 'admin@demo.freight.local',
    passwordHash: await hashDemoPassword(adminPassword, pepper),
    displayName: 'Demo Tenant Admin',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.TENANT_ADMIN).id,
  });
  const customerUser = await upsertDemoUser({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    email: 'customer@demo.freight.local',
    passwordHash: await hashDemoPassword(customerPassword, pepper),
    displayName: 'Demo Customer Admin',
    userType: 'CUSTOMER',
    roleId: requireRole(roleRecords, RoleCode.CUSTOMER_ADMIN).id,
  });

  await seedDemoBookingFlow({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    adminUserId: admin.id,
    customerUserId: customerUser.id,
  });

  console.info(
    `Demo users ready for tenant ${tenant.code}: ${admin.email} and customer@demo.freight.local`,
  );
}

async function seedDemoBookingFlow({ tenantId, customerCompanyId, adminUserId, customerUserId }) {
  const now = new Date();
  const etd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const acceptedQuote = await prisma.quote.upsert({
    where: { tenantId_quoteNo: { tenantId, quoteNo: 'QT-DEMO-ACCEPTED' } },
    update: {
      status: 'ACCEPTED',
      acceptedAt: now,
      bookedAt: null,
      validUntil,
      etd,
      updatedById: customerUserId,
    },
    create: {
      id: 'demo_quote_accepted_v1',
      tenantId,
      quoteNo: 'QT-DEMO-ACCEPTED',
      customerCompanyId,
      salesOwnerId: adminUserId,
      status: 'ACCEPTED',
      polCode: 'CNSZX',
      podCode: 'USLAX',
      carrierCode: 'COSCO',
      etd,
      validUntil,
      currency: 'USD',
      subtotal: '2450.00',
      totalAmount: '2450.00',
      acceptedAt: now,
      createdById: customerUserId,
      updatedById: customerUserId,
    },
  });
  await prisma.quoteItem.upsert({
    where: { id: 'demo_quote_item_accepted_v1' },
    update: { quantity: '1', unitPrice: '2450.00', amount: '2450.00' },
    create: {
      id: 'demo_quote_item_accepted_v1',
      tenantId,
      quoteId: acceptedQuote.id,
      chargeCode: 'OCEAN_FREIGHT',
      chargeName: 'Ocean Freight',
      containerType: '40HQ',
      quantity: '1',
      unitPrice: '2450.00',
      amount: '2450.00',
      currency: 'USD',
      sortOrder: 0,
    },
  });

  const bookedQuote = await prisma.quote.upsert({
    where: { tenantId_quoteNo: { tenantId, quoteNo: 'QT-DEMO-BOOKED' } },
    update: { status: 'BOOKED', bookedAt: now, validUntil, etd },
    create: {
      id: 'demo_quote_booked_v1',
      tenantId,
      quoteNo: 'QT-DEMO-BOOKED',
      customerCompanyId,
      salesOwnerId: adminUserId,
      status: 'BOOKED',
      polCode: 'CNSHA',
      podCode: 'USLGB',
      carrierCode: 'OOCL',
      etd,
      validUntil,
      currency: 'USD',
      subtotal: '1850.00',
      totalAmount: '1850.00',
      acceptedAt: now,
      bookedAt: now,
      createdById: customerUserId,
      updatedById: customerUserId,
    },
  });
  await prisma.quoteItem.upsert({
    where: { id: 'demo_quote_item_booked_v1' },
    update: { quantity: '1', unitPrice: '1850.00', amount: '1850.00' },
    create: {
      id: 'demo_quote_item_booked_v1',
      tenantId,
      quoteId: bookedQuote.id,
      chargeCode: 'OCEAN_FREIGHT',
      chargeName: 'Ocean Freight',
      containerType: '40GP',
      quantity: '1',
      unitPrice: '1850.00',
      amount: '1850.00',
      currency: 'USD',
      sortOrder: 0,
    },
  });
  const booking = await prisma.booking.upsert({
    where: { tenantId_bookingNo: { tenantId, bookingNo: 'BOOK-DEMO-DRAFT' } },
    update: {
      quoteId: bookedQuote.id,
      etd,
      updatedById: customerUserId,
    },
    create: {
      id: 'demo_booking_draft_v1',
      tenantId,
      bookingNo: 'BOOK-DEMO-DRAFT',
      quoteId: bookedQuote.id,
      customerCompanyId,
      status: 'DRAFT',
      polCode: 'CNSHA',
      podCode: 'USLGB',
      carrierCode: 'OOCL',
      etd,
      commodity: 'Consumer electronics accessories',
      packages: 320,
      grossWeight: '9800.00',
      volumeCbm: '54.50',
      shipperName: 'Northstar Trading Co., Ltd.',
      shipperAddress: 'Pudong New Area, Shanghai, China',
      bookingContactName: 'Demo Customer Admin',
      bookingContactEmail: 'customer@demo.freight.local',
      createdById: customerUserId,
      updatedById: customerUserId,
    },
  });
  await prisma.bookingContainerRequest.upsert({
    where: { bookingId_containerType: { bookingId: booking.id, containerType: '40GP' } },
    update: { quantity: 1, weightPerContainer: '9800.00', sortOrder: 0 },
    create: {
      id: 'demo_booking_container_v1',
      tenantId,
      bookingId: booking.id,
      containerType: '40GP',
      quantity: 1,
      weightPerContainer: '9800.00',
      sortOrder: 0,
    },
  });
  console.info('Demo booking flow ready: one accepted quote and one draft booking.');
}

function requireDemoSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(`${name} must be set to at least 8 characters when SEED_DEMO_DATA=true`);
  }
  return value;
}

function requireRole(roleRecords, code) {
  const role = roleRecords.get(code);
  if (!role) throw new Error(`Missing demo role: ${code}`);
  return role;
}

async function hashDemoPassword(password, pepper) {
  const prehash = createHash('sha256').update(password).update(pepper).digest('base64url');
  return hash(prehash, 12);
}

async function upsertDemoUser({ roleId, ...userData }) {
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: userData.tenantId, email: userData.email } },
    update: { ...userData, status: 'ACTIVE' },
    create: { ...userData, status: 'ACTIVE' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId } },
    update: {},
    create: { userId: user.id, roleId },
  });
  return user;
}

async function main() {
  const permissionRecords = await seedPermissions();
  await seedDemoTenant(permissionRecords);
}

main()
  .then(() => {
    console.info('Seed completed.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
