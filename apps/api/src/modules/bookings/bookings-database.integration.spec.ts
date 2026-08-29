import { BookingStatus, Prisma, QuoteStatus, RoleCode, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { BookingsService } from './bookings.service.js';
import type { DocumentStorageService } from './document-storage.service.js';
import { DocumentsService } from './documents.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const storage = {
  upload: jest.fn().mockResolvedValue(undefined),
  download: jest.fn().mockResolvedValue(Buffer.from('demo-so')),
  remove: jest.fn().mockResolvedValue(undefined),
  onModuleDestroy: jest.fn(),
} as unknown as DocumentStorageService;
const service = new BookingsService(prisma, context, new BookingStateMachine(), storage);
const documents = new DocumentsService(prisma, context, storage);
const tenantIds: string[] = [];
let tenantA: string;
let tenantB: string;
let customerA: string;
let customerB: string;
let userA: string;
let userB: string;
let operationA: string;
let quoteA: string;
let bookingA: string;

describe('booking database integration', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({
        data: { code: `BOOK-A-${runId}`, name: 'Booking A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `BOOK-B-${runId}`, name: 'Booking B', status: 'ACTIVE' },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
    tenantIds.push(a.id, b.id);
    customerA = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantA, code: 'A', name: 'Customer A', status: 'ACTIVE' },
      })
    ).id;
    customerB = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantB, code: 'B', name: 'Customer B', status: 'ACTIVE' },
      })
    ).id;
    userA = (await createUser(tenantA, customerA, 'a')).id;
    userB = (await createUser(tenantB, customerB, 'b')).id;
    operationA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `operation-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Operation',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    quoteA = (
      await prisma.quote.create({
        data: {
          tenantId: tenantA,
          quoteNo: `QT-${runId}`,
          customerCompanyId: customerA,
          status: QuoteStatus.ACCEPTED,
          polCode: 'CNSHA',
          podCode: 'USLAX',
          carrierCode: 'COSCO',
          validUntil: day(7),
          currency: 'USD',
          subtotal: new Prisma.Decimal(1200),
          totalAmount: new Prisma.Decimal(1200),
          items: {
            create: {
              tenantId: tenantA,
              chargeCode: 'OCEAN_FREIGHT',
              chargeName: 'Ocean freight',
              containerType: '40HQ',
              quantity: new Prisma.Decimal(2),
              unitPrice: new Prisma.Decimal(600),
              amount: new Prisma.Decimal(1200),
              currency: 'USD',
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.document.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingContainerRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quoteItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quote.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.businessNumberCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
    storage.onModuleDestroy();
  });

  it('creates a tenant-scoped draft snapshot and books the accepted quote atomically', async () => {
    const created = await runCustomer(tenantA, userA, customerA, () =>
      service.create({ quoteId: quoteA }),
    );
    bookingA = created.id;
    expect(created.bookingNo).toMatch(/^BOOK\d{12}$/);
    expect(created.status).toBe(BookingStatus.DRAFT);
    expect(created.containerRequests).toMatchObject([{ containerType: '40HQ', quantity: 2 }]);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteA } })).status).toBe(
      QuoteStatus.BOOKED,
    );
    await expect(
      runCustomer(tenantA, userA, customerA, () => service.create({ quoteId: quoteA })),
    ).rejects.toMatchObject({ response: { code: 'QUOTE_NOT_BOOKABLE' } });
  });

  it('blocks cross-tenant and cross-customer booking reads', async () => {
    await expect(
      runCustomer(tenantB, userB, customerB, () => service.get(bookingA)),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
    const own = await runCustomer(tenantA, userA, customerA, () =>
      service.list({ page: 1, pageSize: 20 }),
    );
    expect(own.items.map((booking) => booking.id)).toContain(bookingA);
  });

  it('validates completeness and enforces the approved review/confirm workflow', async () => {
    await expect(
      runCustomer(tenantA, userA, customerA, () => service.submit(bookingA)),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_INCOMPLETE' } });
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(bookingA, {
        commodity: 'Consumer goods',
        packages: 100,
        grossWeight: '12000',
        volumeCbm: '58.5',
        shipperName: 'Example Shipper',
        shipperAddress: 'Shanghai, China',
        bookingContactName: 'Alex',
        bookingContactEmail: 'alex@example.test',
      }),
    );
    await runCustomer(tenantA, userA, customerA, () => service.submit(bookingA));
    await runInternal(() => service.review(bookingA, { remark: 'Documents checked' }));
    const confirmed = await runInternal(() =>
      service.confirm(bookingA, { remark: 'Space confirmed' }),
    );
    expect(confirmed.status).toBe(BookingStatus.CONFIRMED);
    expect(confirmed.confirmedAt).toBeDefined();
    await expect(
      runInternal(() => service.reject(bookingA, { remark: 'Too late to reject' })),
    ).rejects.toMatchObject({ response: { code: 'ILLEGAL_BOOKING_TRANSITION' } });
  });
  it('releases a customer-visible SO and creates one tenant-scoped shipment', async () => {
    const document = await runInternal(() =>
      service.releaseSo(bookingA, {
        buffer: Buffer.from('%PDF demo SO'),
        originalname: 'shipping-order.pdf',
        mimetype: 'application/pdf',
        size: 12,
      } as Express.Multer.File),
    );
    expect(document.customerVisible).toBe(true);
    expect(document.documentType).toBe('SO');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } })).status).toBe(
      BookingStatus.SO_RELEASED,
    );
    const shipment = await runInternal(() =>
      service.createShipment(bookingA, { vessel: 'Demo Vessel', voyage: 'DV001' }),
    );
    expect(shipment.shipmentNo).toMatch(/^SHP\d{12}$/);
    expect(shipment.bookingId).toBe(bookingA);
    const visible = await runCustomer(tenantA, userA, customerA, () =>
      documents.listForBooking(bookingA),
    );
    expect(visible.map((item) => item.id)).toContain(document.id);
    const hidden = await prisma.document.create({
      data: {
        tenantId: tenantA,
        bookingId: bookingA,
        documentType: 'INTERNAL_NOTE',
        objectKey: `tests/${runId}/internal-note`,
        originalFilename: 'internal-note.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        customerVisible: false,
        uploadedById: operationA,
      },
    });
    const customerDocuments = await runCustomer(tenantA, userA, customerA, () =>
      documents.listForBooking(bookingA),
    );
    expect(customerDocuments.map((item) => item.id)).not.toContain(hidden.id);
    await expect(
      runCustomer(tenantB, userB, customerB, () => documents.download(document.id)),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } });
  });
});

function runCustomer<T>(
  tenantId: string,
  userId: string,
  customerCompanyId: string,
  fn: () => Promise<T>,
) {
  return context.run(
    { requestId: `booking-${runId}`, tenantId, userId, customerCompanyId, roles: [] },
    fn,
  );
}

function runInternal<T>(fn: () => Promise<T>) {
  return context.run(
    {
      requestId: `booking-internal-${runId}`,
      tenantId: tenantA,
      userId: operationA,
      roles: [RoleCode.OPERATION],
    },
    fn,
  );
}

function createUser(tenantId: string, customerCompanyId: string, suffix: string) {
  return prisma.user.create({
    data: {
      tenantId,
      customerCompanyId,
      email: `${suffix}-${runId}@example.test`,
      passwordHash: 'unused',
      displayName: suffix,
      userType: UserType.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  });
}

function day(offset: number) {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
}
