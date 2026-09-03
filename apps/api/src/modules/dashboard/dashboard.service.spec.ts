import {
  BookingStatus,
  InvoiceStatus,
  NotificationChannel,
  Prisma,
  QuoteStatus,
  RoleCode,
  ShipmentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { DashboardService } from './dashboard.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const service = new DashboardService(prisma, context);
const tenantIds: string[] = [];
let tenantA: string;
let tenantB: string;
let customerA: string;
let customerB: string;
let internalA: string;
let salesA: string;
let financeA: string;
let customerUserA: string;

describe('dashboard service', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({
        data: { code: `DASH-A-${runId}`, name: 'Dashboard A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `DASH-B-${runId}`, name: 'Dashboard B', status: 'ACTIVE' },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
    tenantIds.push(a.id, b.id);
    customerA = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantA, code: 'DASH-A', name: 'Dashboard Customer A', status: 'ACTIVE' },
      })
    ).id;
    customerB = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantB, code: 'DASH-B', name: 'Dashboard Customer B', status: 'ACTIVE' },
      })
    ).id;
    internalA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `dash-internal-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Dashboard Operation',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    salesA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `dash-sales-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Dashboard Sales',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    financeA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `dash-finance-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Dashboard Finance',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    await prisma.customerCompany.update({
      where: { id: customerA },
      data: { salesOwnerId: salesA },
    });
    customerUserA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          customerCompanyId: customerA,
          email: `dash-customer-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Dashboard Customer',
          userType: UserType.CUSTOMER,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    await seedTenantData(tenantA, customerA, customerUserA, 'A');
    await seedTenantData(tenantB, customerB, null, 'B');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.invoiceLine.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.trackingEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingContainerRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quoteItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quote.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('returns tenant-scoped admin tasks and unread notification counts', async () => {
    const dashboard = await context.run(
      {
        requestId: `dashboard-admin-${runId}`,
        tenantId: tenantA,
        userId: internalA,
        roles: [RoleCode.OPERATION],
      },
      () => service.admin(),
    );

    expect(dashboard.stats.submittedBookings).toBe(1);
    expect(dashboard.stats.bookingSubmitted).toBe(1);
    expect(dashboard.stats.departedShipments).toBe(1);
    expect(dashboard.stats.unreadNotifications).toBe(0);
    expect(dashboard.tasks.map((task) => task.title).join(' ')).toContain(`DASH-BOOK-A-SUBMITTED`);
    expect(dashboard.tasks.map((task) => task.title).join(' ')).not.toContain(`DASH-BOOK-B`);
  });

  it('returns a sales-focused dashboard scoped to owned customers', async () => {
    const dashboard = await context.run(
      {
        requestId: `dashboard-sales-${runId}`,
        tenantId: tenantA,
        userId: salesA,
        roles: [RoleCode.SALES],
      },
      () => service.admin(),
    );

    expect(dashboard.roleView.code).toBe('SALES');
    expect(dashboard.summary.find((item) => item.label === '待确认报价')?.value).toBe(1);
    expect(dashboard.tasks.map((task) => task.type)).toContain('QUOTE');
    expect(dashboard.tasks.map((task) => task.title).join(' ')).toContain(`DASH-QT-A-DRAFT`);
    expect(dashboard.tasks.map((task) => task.title).join(' ')).not.toContain(`DASH-QT-B`);
  });

  it('returns a finance-focused dashboard with invoice tasks', async () => {
    const dashboard = await context.run(
      {
        requestId: `dashboard-finance-${runId}`,
        tenantId: tenantA,
        userId: financeA,
        roles: [RoleCode.FINANCE],
      },
      () => service.admin(),
    );

    expect(dashboard.roleView.code).toBe('FINANCE');
    expect(dashboard.stats.issuedInvoices).toBe(1);
    expect(dashboard.tasks.some((task) => task.type === 'INVOICE')).toBe(true);
    expect(dashboard.tasks.map((task) => task.title).join(' ')).toContain('DASH-INV-A');
    expect(dashboard.tasks.map((task) => task.title).join(' ')).not.toContain('DASH-INV-B');
  });

  it('returns customer-scoped portal actions, shipments, invoices, and unread notifications', async () => {
    const dashboard = await context.run(
      {
        requestId: `dashboard-portal-${runId}`,
        tenantId: tenantA,
        userId: customerUserA,
        customerCompanyId: customerA,
        roles: [RoleCode.CUSTOMER_USER],
      },
      () => service.portal(),
    );

    expect(dashboard.stats.actionBookings).toBe(1);
    expect(dashboard.stats.pendingQuotes).toBe(2);
    expect(dashboard.stats.activeShipments).toBe(2);
    expect(dashboard.stats.issuedInvoices).toBe(1);
    expect(dashboard.stats.unreadNotifications).toBe(1);
    expect(dashboard.actions.map((action) => action.href)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/portal/bookings/'),
        expect.stringContaining('/portal/quotes/'),
      ]),
    );
    expect(dashboard.actions.map((action) => action.title).join(' ')).toContain(
      'DASH-QT-A-SENT',
    );
    expect(dashboard.actions.map((action) => action.title).join(' ')).toContain(
      'DASH-QT-A-ACCEPTED',
    );
    expect(dashboard.actions.map((action) => action.title).join(' ')).not.toContain(
      'DASH-QT-B-SENT',
    );
    expect(
      dashboard.recentShipments.map((shipment) => shipment.shipmentNo).join(' '),
    ).not.toContain('DASH-SHP-B');
  });
});

async function seedTenantData(
  tenantId: string,
  customerCompanyId: string,
  recipientUserId: string | null,
  suffix: string,
) {
  const submitted = await createBooking(
    tenantId,
    customerCompanyId,
    `DASH-BOOK-${suffix}-SUBMITTED`,
    BookingStatus.SUBMITTED,
  );
  const bookingSubmitted = await createBooking(
    tenantId,
    customerCompanyId,
    `DASH-BOOK-${suffix}-WAIT-SO`,
    BookingStatus.BOOKING_SUBMITTED,
  );
  await createBooking(
    tenantId,
    customerCompanyId,
    `DASH-BOOK-${suffix}-REVISION`,
    BookingStatus.REVISION_REQUIRED,
  );
  const planned = await createShipment(
    tenantId,
    customerCompanyId,
    submitted.id,
    `DASH-SHP-${suffix}-PLANNED`,
    ShipmentStatus.PLANNED,
  );
  await createShipment(
    tenantId,
    customerCompanyId,
    bookingSubmitted.id,
    `DASH-SHP-${suffix}-DEPARTED`,
    ShipmentStatus.DEPARTED,
  );
  await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNo: `DASH-INV-${suffix}`,
      shipmentId: planned.id,
      customerCompanyId,
      currency: 'USD',
      subtotal: new Prisma.Decimal(1200),
      totalAmount: new Prisma.Decimal(1200),
      dueDate: day(30),
      status: InvoiceStatus.ISSUED,
      lines: {
        create: {
          tenantId,
          chargeCode: 'OF',
          description: 'Ocean freight',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(1200),
          amount: new Prisma.Decimal(1200),
          currency: 'USD',
        },
      },
    },
  });
  await prisma.quote.create({
    data: {
      tenantId,
      quoteNo: `DASH-QT-${suffix}-DRAFT`,
      customerCompanyId,
      status: QuoteStatus.DRAFT,
      polCode: 'CNSHA',
      podCode: 'USLAX',
      validUntil: day(7),
      currency: 'USD',
      subtotal: new Prisma.Decimal(1200),
      totalAmount: new Prisma.Decimal(1200),
      items: {
        create: {
          tenantId,
          chargeCode: 'OCEAN_FREIGHT',
          chargeName: 'Ocean freight',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(1200),
          amount: new Prisma.Decimal(1200),
          currency: 'USD',
        },
      },
    },
  });
  await prisma.quote.create({
    data: {
      tenantId,
      quoteNo: `DASH-QT-${suffix}-ACCEPTED`,
      customerCompanyId,
      status: QuoteStatus.ACCEPTED,
      polCode: 'CNSZX',
      podCode: 'USNYC',
      carrierCode: 'MAEU',
      validUntil: day(7),
      currency: 'CNY',
      subtotal: new Prisma.Decimal(3400),
      totalAmount: new Prisma.Decimal(3400),
      items: {
        create: {
          tenantId,
          chargeCode: 'OCEAN_FREIGHT',
          chargeName: 'Ocean freight',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(3400),
          amount: new Prisma.Decimal(3400),
          currency: 'CNY',
        },
      },
    },
  });
  await prisma.quote.create({
    data: {
      tenantId,
      quoteNo: `DASH-QT-${suffix}-SENT`,
      customerCompanyId,
      status: QuoteStatus.SENT,
      polCode: 'CNSZX',
      podCode: 'USNYC',
      carrierCode: 'MAEU',
      validUntil: day(7),
      currency: 'CNY',
      subtotal: new Prisma.Decimal(3400),
      totalAmount: new Prisma.Decimal(3400),
      items: {
        create: {
          tenantId,
          chargeCode: 'OCEAN_FREIGHT',
          chargeName: 'Ocean freight',
          quantity: new Prisma.Decimal(1),
          unitPrice: new Prisma.Decimal(3400),
          amount: new Prisma.Decimal(3400),
          currency: 'CNY',
        },
      },
    },
  });
  if (recipientUserId) {
    await prisma.notification.create({
      data: {
        tenantId,
        recipientUserId,
        recipient: recipientUserId,
        type: 'SHIPMENT_DEPARTED',
        channel: NotificationChannel.IN_APP,
        payload: { title: 'Shipment 已开船', href: `/portal/shipments/${planned.id}` },
      },
    });
  }
}

function createBooking(
  tenantId: string,
  customerCompanyId: string,
  bookingNo: string,
  status: BookingStatus,
) {
  return prisma.booking.create({
    data: {
      tenantId,
      customerCompanyId,
      bookingNo,
      status,
      polCode: 'CNSHA',
      podCode: 'USLAX',
      containerRequests: {
        create: { tenantId, containerType: '40HQ', quantity: 1 },
      },
    },
  });
}

function createShipment(
  tenantId: string,
  customerCompanyId: string,
  bookingId: string,
  shipmentNo: string,
  status: ShipmentStatus,
) {
  return prisma.shipment.create({
    data: {
      tenantId,
      customerCompanyId,
      bookingId,
      shipmentNo,
      status,
      polCode: 'CNSHA',
      podCode: 'USLAX',
      eta: day(21),
    },
  });
}

function day(offset: number) {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
}
