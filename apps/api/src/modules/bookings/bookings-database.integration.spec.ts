import { BookingStatus, Prisma, QuoteStatus, RoleCode, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { BookingsService } from './bookings.service.js';
import { BookingSoService } from './booking-so.service.js';
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
const service = new BookingsService(prisma, context, new BookingStateMachine());
const bookingSo = new BookingSoService(prisma, context, storage);
const documents = new DocumentsService(prisma, context, storage);
const tenantIds: string[] = [];
let tenantA: string;
let tenantB: string;
let customerA: string;
let customerAOther: string;
let customerB: string;
let userA: string;
let userAOther: string;
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
    customerAOther = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantA, code: 'A-OTHER', name: 'Customer A Other', status: 'ACTIVE' },
      })
    ).id;
    userA = (await createUser(tenantA, customerA, 'a')).id;
    userAOther = (await createUser(tenantA, customerAOther, 'a-other')).id;
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
    await prisma.bookingSoRecord.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.document.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingContainerRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerShipper.deleteMany({ where: { tenantId: { in: tenantIds } } });
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
    const defaultShipper = await runCustomer(tenantA, userA, customerA, () =>
      service.createCustomerShipper({
        name: 'Default Shipper',
        address: 'Shanghai, China',
        isDefault: true,
      }),
    );
    const created = await runCustomer(tenantA, userA, customerA, () =>
      service.create({ quoteId: quoteA }),
    );
    bookingA = created.id;
    expect(created.bookingNo).toMatch(/^BOOK\d{12}$/);
    expect(created.status).toBe(BookingStatus.DRAFT);
    expect(created.containerRequests).toMatchObject([{ containerType: '40HQ', quantity: 2 }]);
    expect(created).toMatchObject({
      sourceShipperId: defaultShipper.id,
      shipperName: 'Default Shipper',
      bookingContactName: 'a',
      bookingContactEmail: `a-${runId}@example.test`,
    });
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

  it('keeps the shipper address book inside the customer and tenant boundary', async () => {
    const foreign = await runCustomer(tenantB, userB, customerB, () =>
      service.createCustomerShipper({ name: 'Foreign Shipper', address: 'Los Angeles, USA' }),
    );
    await expect(
      runCustomer(tenantA, userA, customerA, () =>
        service.update(bookingA, { sourceShipperId: foreign.id }),
      ),
    ).rejects.toMatchObject({ response: { code: 'SHIPPER_NOT_IN_CUSTOMER_SCOPE' } });
    const own = await runCustomer(tenantA, userA, customerA, () => service.listCustomerShippers());
    expect(own.map((shipper) => shipper.id)).not.toContain(foreign.id);
    await expect(
      runCustomer(tenantA, userA, customerA, () =>
        service.updateCustomerShipper(foreign.id, { name: 'Tampered' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_SHIPPER_NOT_FOUND' } });
    const sameTenantOtherCustomer = await runCustomer(tenantA, userAOther, customerAOther, () =>
      service.createCustomerShipper({ name: 'Other Customer Shipper', address: 'Suzhou' }),
    );
    await expect(
      runCustomer(tenantA, userA, customerA, () =>
        service.update(bookingA, { sourceShipperId: sameTenantOtherCustomer.id }),
      ),
    ).rejects.toMatchObject({ response: { code: 'SHIPPER_NOT_IN_CUSTOMER_SCOPE' } });
    await expect(
      runCustomer(tenantA, userA, customerA, () =>
        service.updateCustomerShipper(sameTenantOtherCustomer.id, { name: 'Tampered' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_SHIPPER_NOT_FOUND' } });
  });

  it('updates, switches the default, and deactivates a customer shipper with audit history', async () => {
    const second = await runCustomer(tenantA, userA, customerA, () =>
      service.createCustomerShipper({ name: 'Second Shipper', address: 'Ningbo, China' }),
    );
    const updated = await runCustomer(tenantA, userA, customerA, () =>
      service.updateCustomerShipper(second.id, {
        address: 'Ningbo Port, China',
        isDefault: true,
      }),
    );
    expect(updated).toMatchObject({ address: 'Ningbo Port, China', isDefault: true });
    const defaults = await prisma.customerShipper.count({
      where: { tenantId: tenantA, customerCompanyId: customerA, isDefault: true, status: 'ACTIVE' },
    });
    expect(defaults).toBe(1);
    const inactive = await runCustomer(tenantA, userA, customerA, () =>
      service.updateCustomerShipper(second.id, { status: 'INACTIVE' }),
    );
    expect(inactive).toMatchObject({ status: 'INACTIVE', isDefault: false });
    expect(
      await prisma.auditLog.count({
        where: { tenantId: tenantA, entityType: 'CustomerShipper', entityId: second.id },
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('supports revision, resubmission, approval, and carrier submission with traceable history', async () => {
    await expect(
      runCustomer(tenantA, userA, customerA, () => service.submit(bookingA)),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_INCOMPLETE' } });
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(bookingA, {
        commodity: 'Consumer goods',
        packageType: 'CARTON',
        packages: 100,
        grossWeight: '12000',
        volumeCbm: '58.5',
        cargoReadyDate: '2026-09-02',
        shipperName: 'Example Shipper',
        shipperAddress: 'Shanghai, China',
        bookingContactName: 'Alex',
        bookingContactEmail: 'alex@example.test',
      }),
    );
    await runCustomer(tenantA, userA, customerA, () => service.submit(bookingA));
    const revision = await runInternal(() =>
      service.requestRevision(bookingA, {
        reasonCode: 'CARGO_INCOMPLETE',
        customerVisibleRemark: 'Please clarify the cargo description',
        internalRemark: 'Commercial notes remain internal',
      }),
    );
    expect(revision.status).toBe(BookingStatus.REVISION_REQUIRED);
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(bookingA, { commodity: 'Consumer electronics accessories' }),
    );
    await runCustomer(tenantA, userA, customerA, () => service.submit(bookingA));
    const approved = await runInternal(() => service.approve(bookingA, { remark: 'Checked' }));
    expect(approved.status).toBe(BookingStatus.APPROVED);
    const submitted = await runInternal(() =>
      service.submitToCarrier(bookingA, {
        sourceName: 'Demo Carrier Agent',
        reference: 'AGENT-REF-001',
        internalRemark: 'Submitted by email',
      }),
    );
    expect(submitted.status).toBe(BookingStatus.BOOKING_SUBMITTED);
    await expect(
      runInternal(() => service.approve(bookingA, { remark: 'Duplicate approval' })),
    ).rejects.toMatchObject({ response: { code: 'ILLEGAL_BOOKING_TRANSITION' } });
    const internal = await runInternal(() => service.getInternal(bookingA));
    expect(internal.reviewActions).toHaveLength(3);
    expect(internal.reviewActions[2]).toMatchObject({
      action: 'REQUEST_REVISION',
      internalRemark: 'Commercial notes remain internal',
    });
    const customer = await runCustomer(tenantA, userA, customerA, () => service.get(bookingA));
    expect(JSON.stringify(customer.reviewActions)).not.toContain(
      'Commercial notes remain internal',
    );
    expect(customer.reviewActions.some((action) => action.action === 'REQUEST_REVISION')).toBe(
      true,
    );
    expect(
      await prisma.auditLog.count({
        where: { tenantId: tenantA, entityType: 'Booking', entityId: bookingA },
      }),
    ).toBeGreaterThanOrEqual(8);
  });

  it('keeps SO internal until publish and safely replaces the published version', async () => {
    const draft = await runInternal(() =>
      bookingSo.create(
        bookingA,
        {
          soNumber: `SO-${runId}`,
          sourceType: 'CARRIER',
          sourceName: 'Demo Carrier',
          carrierCode: 'COSCO',
          vessel: 'Demo Vessel',
          voyage: 'DV001',
          receivedAt: new Date().toISOString(),
        },
        soFile('shipping-order-v1.pdf'),
      ),
    );
    expect(draft).toMatchObject({ status: 'INTERNAL_DRAFT', version: 1 });
    expect(draft.document.customerVisible).toBe(false);
    expect(
      await runCustomer(tenantA, userA, customerA, () => bookingSo.listCustomer(bookingA)),
    ).toEqual([]);
    await expect(
      runCustomer(tenantA, userA, customerA, () => documents.download(draft.document.id)),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } });
    await expect(
      runInternal(() => service.createShipment(bookingA, { vessel: 'Demo Vessel' })),
    ).rejects.toMatchObject({
      response: { code: 'BOOKED_BOOKING_WITH_PUBLISHED_SO_NOT_FOUND' },
    });
    const published = await runInternal(() => bookingSo.publish(bookingA, draft.id));
    expect(published).toMatchObject({ status: 'PUBLISHED', version: 1 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } })).status).toBe(
      BookingStatus.BOOKED,
    );
    expect(
      await runCustomer(tenantA, userA, customerA, () => bookingSo.listCustomer(bookingA)),
    ).toHaveLength(1);

    const replacement = await runInternal(() =>
      bookingSo.replace(
        bookingA,
        published.id,
        {
          soNumber: `SO-${runId}-R2`,
          sourceType: 'AGENT',
          sourceName: 'Demo Agent',
          receivedAt: new Date().toISOString(),
        },
        soFile('shipping-order-v2.pdf'),
      ),
    );
    expect(replacement).toMatchObject({ status: 'INTERNAL_DRAFT', version: 2 });
    const beforeReplacementPublish = await runCustomer(tenantA, userA, customerA, () =>
      bookingSo.listCustomer(bookingA),
    );
    expect(beforeReplacementPublish.map((item) => item.id)).toEqual([published.id]);
    await runInternal(() => bookingSo.publish(bookingA, replacement.id));
    const afterReplacementPublish = await runCustomer(tenantA, userA, customerA, () =>
      bookingSo.listCustomer(bookingA),
    );
    expect(afterReplacementPublish.map((item) => item.id)).toEqual([replacement.id]);
    await expect(
      runCustomer(tenantA, userA, customerA, () => documents.download(published.document.id)),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } });

    const draftThree = await runInternal(() =>
      bookingSo.create(
        bookingA,
        {
          soNumber: `SO-${runId}-R3`,
          sourceType: 'CARRIER',
          receivedAt: new Date().toISOString(),
        },
        soFile('shipping-order-v3.pdf'),
      ),
    );
    const draftFour = await runInternal(() =>
      bookingSo.create(
        bookingA,
        {
          soNumber: `SO-${runId}-R4`,
          sourceType: 'CARRIER',
          receivedAt: new Date().toISOString(),
        },
        soFile('shipping-order-v4.pdf'),
      ),
    );
    const concurrentPublish = await Promise.allSettled([
      runInternal(() => bookingSo.publish(bookingA, draftThree.id)),
      runInternal(() => bookingSo.publish(bookingA, draftFour.id)),
    ]);
    expect(concurrentPublish.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.bookingSoRecord.count({
        where: { tenantId: tenantA, bookingId: bookingA, status: 'PUBLISHED' },
      }),
    ).toBe(1);

    const shipment = await runInternal(() =>
      service.createShipment(bookingA, { vessel: 'Demo Vessel', voyage: 'DV001' }),
    );
    expect(shipment.bookingId).toBe(bookingA);
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
      runCustomer(tenantB, userB, customerB, () => documents.download(replacement.document.id)),
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

function soFile(originalname: string) {
  return {
    buffer: Buffer.from('%PDF demo SO'),
    originalname,
    mimetype: 'application/pdf',
    size: 12,
  } as Express.Multer.File;
}

function day(offset: number) {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
}
