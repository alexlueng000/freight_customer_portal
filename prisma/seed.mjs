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
  ['shipment.manage', 'Manage shipment details and lifecycle'],
  ['tracking.manage', 'Create shipment tracking events'],
  ['document.upload', 'Upload shipment and booking documents'],
  ['document.read', 'View and download authorized documents'],
  ['document.manage', 'Manage shipment document visibility and versions'],
  ['invoice.read', 'View invoices within the permitted customer scope'],
  ['invoice.manage', 'Create, issue, void, and mark invoices paid'],
  ['invoice.confirm', 'Confirm issued invoices within the customer scope'],
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
    'invoice.read',
  ],
  [RoleCode.OPERATION]: [
    'customer.read',
    'customer_user.read',
    'booking.read',
    'booking.manage',
    'shipment.create',
    'shipment.read',
    'shipment.manage',
    'tracking.manage',
    'document.upload',
    'document.read',
    'document.manage',
  ],
  [RoleCode.FINANCE]: [
    'customer.read',
    'shipment.read',
    'document.read',
    'invoice.read',
    'invoice.manage',
  ],
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
    'invoice.read',
    'invoice.confirm',
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
    'invoice.read',
    'invoice.confirm',
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
  const internalPasswordHash = await hashDemoPassword(adminPassword, pepper);
  const customerPasswordHash = await hashDemoPassword(customerPassword, pepper);
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
    passwordHash: internalPasswordHash,
    displayName: 'Demo Tenant Admin',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.TENANT_ADMIN).id,
  });
  const sales = await upsertDemoUser({
    tenantId: tenant.id,
    email: 'sales@demo.freight.local',
    passwordHash: internalPasswordHash,
    displayName: 'Demo Sales',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.SALES).id,
  });
  await upsertDemoUser({
    tenantId: tenant.id,
    email: 'operation@demo.freight.local',
    passwordHash: internalPasswordHash,
    displayName: 'Demo Operation',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.OPERATION).id,
  });
  await upsertDemoUser({
    tenantId: tenant.id,
    email: 'finance@demo.freight.local',
    passwordHash: internalPasswordHash,
    displayName: 'Demo Finance',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.FINANCE).id,
  });
  const customerUser = await upsertDemoUser({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    email: 'customer@demo.freight.local',
    passwordHash: customerPasswordHash,
    displayName: 'Demo Customer Admin',
    userType: 'CUSTOMER',
    roleId: requireRole(roleRecords, RoleCode.CUSTOMER_ADMIN).id,
  });
  await upsertDemoUser({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    email: 'customer-user@demo.freight.local',
    passwordHash: customerPasswordHash,
    displayName: 'Demo Customer User',
    userType: 'CUSTOMER',
    roleId: requireRole(roleRecords, RoleCode.CUSTOMER_USER).id,
  });

  await prisma.customerCompany.update({
    where: { id: customerCompany.id },
    data: { salesOwnerId: sales.id },
  });
  await prisma.quote.updateMany({
    where: { tenantId: tenant.id, customerCompanyId: customerCompany.id },
    data: { salesOwnerId: sales.id },
  });

  await seedDemoBookingFlow({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    adminUserId: admin.id,
    salesUserId: sales.id,
    customerUserId: customerUser.id,
  });

  console.info(
    `Demo role users ready for tenant ${tenant.code}: tenant admin, sales, operation, finance, customer admin, and customer user.`,
  );
}

async function seedDemoBookingFlow({
  tenantId,
  customerCompanyId,
  adminUserId,
  salesUserId,
  customerUserId,
}) {
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
      salesOwnerId: salesUserId,
      updatedById: customerUserId,
    },
    create: {
      id: 'demo_quote_accepted_v1',
      tenantId,
      quoteNo: 'QT-DEMO-ACCEPTED',
      customerCompanyId,
      salesOwnerId: salesUserId,
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
    update: { status: 'BOOKED', bookedAt: now, validUntil, etd, salesOwnerId: salesUserId },
    create: {
      id: 'demo_quote_booked_v1',
      tenantId,
      quoteNo: 'QT-DEMO-BOOKED',
      customerCompanyId,
      salesOwnerId: salesUserId,
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
  const shipmentBooking = await prisma.booking.upsert({
    where: { tenantId_bookingNo: { tenantId, bookingNo: 'BOOK-DEMO-SHIPPED' } },
    update: {
      status: 'SO_RELEASED',
      etd,
      confirmedAt: now,
      updatedById: adminUserId,
    },
    create: {
      id: 'demo_booking_shipped_v1',
      tenantId,
      bookingNo: 'BOOK-DEMO-SHIPPED',
      customerCompanyId,
      status: 'SO_RELEASED',
      polCode: 'CNSHA',
      podCode: 'USLGB',
      carrierCode: 'OOCL',
      etd,
      commodity: 'Consumer electronics accessories',
      packages: 320,
      grossWeight: '9800.00',
      volumeCbm: '54.50',
      shipperName: 'Northstar Trading Co., Ltd.',
      bookingContactName: 'Demo Customer Admin',
      bookingContactEmail: 'customer@demo.freight.local',
      confirmedAt: now,
      createdById: customerUserId,
      updatedById: adminUserId,
    },
  });
  await prisma.bookingContainerRequest.upsert({
    where: {
      bookingId_containerType: { bookingId: shipmentBooking.id, containerType: '40GP' },
    },
    update: { quantity: 1, weightPerContainer: '9800.00', sortOrder: 0 },
    create: {
      id: 'demo_booking_container_shipped_v1',
      tenantId,
      bookingId: shipmentBooking.id,
      containerType: '40GP',
      quantity: 1,
      weightPerContainer: '9800.00',
      sortOrder: 0,
    },
  });
  const demoShipment = await prisma.shipment.upsert({
    where: { tenantId_shipmentNo: { tenantId, shipmentNo: 'SHP-DEMO-PLANNED' } },
    update: { bookingId: shipmentBooking.id, etd, createdById: adminUserId },
    create: {
      id: 'demo_shipment_planned_v1',
      tenantId,
      shipmentNo: 'SHP-DEMO-PLANNED',
      bookingId: shipmentBooking.id,
      customerCompanyId,
      status: 'PLANNED',
      carrierCode: 'OOCL',
      vessel: 'EVER DEMO',
      voyage: 'EV2608',
      polCode: 'CNSHA',
      podCode: 'USLGB',
      etd,
      createdById: adminUserId,
    },
  });
  const dueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const demoInvoice = await prisma.invoice.upsert({
    where: { tenantId_invoiceNo: { tenantId, invoiceNo: 'INV-DEMO-ISSUED' } },
    update: {
      shipmentId: demoShipment.id,
      customerCompanyId,
      dueDate,
      status: 'ISSUED',
      issuedAt: now,
    },
    create: {
      id: 'demo_invoice_issued_v1',
      tenantId,
      invoiceNo: 'INV-DEMO-ISSUED',
      shipmentId: demoShipment.id,
      customerCompanyId,
      currency: 'USD',
      subtotal: '1850.00',
      taxAmount: '0.00',
      totalAmount: '1850.00',
      dueDate,
      status: 'ISSUED',
      issuedAt: now,
      createdById: adminUserId,
    },
  });
  await prisma.invoiceLine.upsert({
    where: { id: 'demo_invoice_line_issued_v1' },
    update: {
      chargeCode: 'OCEAN_FREIGHT',
      quantity: '1',
      unitPrice: '1850.00',
      amount: '1850.00',
      currency: 'USD',
    },
    create: {
      id: 'demo_invoice_line_issued_v1',
      tenantId,
      invoiceId: demoInvoice.id,
      chargeCode: 'OCEAN_FREIGHT',
      description: 'Ocean freight',
      quantity: '1',
      unitPrice: '1850.00',
      amount: '1850.00',
      currency: 'USD',
      sortOrder: 0,
    },
  });
  console.info(
    'Demo flow ready: accepted quote, draft booking, planned shipment, and issued invoice.',
  );
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
