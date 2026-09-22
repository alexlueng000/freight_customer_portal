import { BookingStatus, Prisma, QuoteStatus, RoleCode, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { BookingsService } from './bookings.service.js';
import { BookingSoService } from './booking-so.service.js';
import type { DocumentStorageService } from './document-storage.service.js';
import { DocumentsService } from './documents.service.js';
import { ShipmentsService } from './shipments.service.js';
import { ShipmentStateMachine } from './shipment-state-machine.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const storage = {
  upload: jest.fn().mockResolvedValue(undefined),
  download: jest.fn().mockResolvedValue(Buffer.from('demo-so')),
  remove: jest.fn().mockResolvedValue(undefined),
  onModuleDestroy: jest.fn(),
} as unknown as DocumentStorageService;
const notificationCalls: CustomerNotificationInput[] = [];
const notificationEvents = {
  createCustomerNotifications(_tx: unknown, input: CustomerNotificationInput): Promise<[]> {
    notificationCalls.push(input);
    return Promise.resolve([]);
  },
  enqueueEmailNotifications(): Promise<void> {
    return Promise.resolve();
  },
};
const service = new BookingsService(
  prisma,
  context,
  new BookingStateMachine(),
  notificationEvents as never,
);
const bookingSo = new BookingSoService(prisma, context, storage, notificationEvents as never);
const documents = new DocumentsService(prisma, context, storage);
const shipments = new ShipmentsService(prisma, context, new ShipmentStateMachine());
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

interface CustomerNotificationInput {
  tenantId: string;
  customerCompanyId: string;
  type: string;
  payload: Record<string, unknown>;
}

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
    const sourceRate = await prisma.rate.create({
      data: {
        tenantId: tenantA,
        rateNo: `RATE-${runId}`,
        polCode: 'CNSHA',
        polName: 'Shanghai',
        podCode: 'USLAX',
        podName: 'Los Angeles',
        carrierCode: 'COSCO',
        serviceName: 'Transpacific Express',
        effectiveDate: day(-1),
        expiryDate: day(7),
        currency: 'USD',
        status: 'ACTIVE',
      },
    });
    quoteA = (
      await prisma.quote.create({
        data: {
          tenantId: tenantA,
          quoteNo: `QT-${runId}`,
          customerCompanyId: customerA,
          sourceRateId: sourceRate.id,
          status: QuoteStatus.ACCEPTED,
          polCode: 'CNSHA',
          podCode: 'USLAX',
          carrierCode: 'COSCO',
          etd: day(5),
          containerQuantity: 2,
          incoterm: 'FOB',
          requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS'],
          pickupLocationText: 'Shanghai warehouse',
          deliveryLocationText: 'Los Angeles warehouse',
          validUntil: day(7),
          currency: 'USD',
          subtotal: new Prisma.Decimal(1200),
          totalAmount: new Prisma.Decimal(1200),
          cargoItems: {
            create: [
              {
                tenantId: tenantA,
                commodity: 'Furniture',
                estimatedGrossWeight: new Prisma.Decimal(15000),
                cargoNature: 'General cargo',
                specialRequirement: 'Keep dry',
                sortOrder: 0,
              },
              {
                tenantId: tenantA,
                commodity: 'Lighting fixtures',
                estimatedGrossWeight: new Prisma.Decimal(2200),
                cargoNature: 'Fragile',
                specialRequirement: 'Handle with care',
                sortOrder: 1,
              },
            ],
          },
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
    await prisma.rate.deleteMany({ where: { tenantId: { in: tenantIds } } });
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
      polCode: 'CNSHA',
      podCode: 'USLAX',
      carrierCode: 'COSCO',
      serviceName: 'Transpacific Express',
      incoterm: 'FOB',
      requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS'],
      pickupLocationText: 'Shanghai warehouse',
      deliveryLocationText: 'Los Angeles warehouse',
      sourceShipperId: defaultShipper.id,
      shipperName: 'Default Shipper',
      bookingContactName: 'a',
      bookingContactEmail: `a-${runId}@example.test`,
    });
    expect(created.cargoItems).toMatchObject([
      {
        commodity: 'Furniture',
        estimatedGrossWeight: new Prisma.Decimal(15000),
        cargoNature: 'General cargo',
        specialRequirement: 'Keep dry',
      },
      {
        commodity: 'Lighting fixtures',
        estimatedGrossWeight: new Prisma.Decimal(2200),
        cargoNature: 'Fragile',
        specialRequirement: 'Handle with care',
      },
    ]);
    const editedCargoItems = created.cargoItems.map((item, index) => ({
      id: item.id,
      commodity: item.commodity,
      estimatedGrossWeight: index === 0 ? '15280' : item.estimatedGrossWeight?.toString(),
      cargoNature: item.cargoNature ?? undefined,
      specialRequirement: item.specialRequirement ?? undefined,
    }));
    const edited = await runCustomer(tenantA, userA, customerA, () =>
      service.update(created.id, {
        polCode: 'CNNGB',
        containerRequests: [{ containerType: '40HQ', quantity: 3 }],
        cargoItems: editedCargoItems,
      }),
    );
    expect(edited.polCode).toBe('CNNGB');
    expect(edited.containerRequests).toMatchObject([{ containerType: '40HQ', quantity: 3 }]);
    expect(edited.cargoItems[0]?.estimatedGrossWeight?.toString()).toBe('15280');
    const sourceCargo = await prisma.quoteCargoItem.findFirstOrThrow({
      where: { quoteId: quoteA, sortOrder: 0 },
    });
    expect(sourceCargo.estimatedGrossWeight?.toString()).toBe('15000');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteA } })).polCode).toBe('CNSHA');
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
        cargoReadyDate: '2026-09-02',
        isDangerousGoods: true,
        shipperName: 'Example Shipper',
        shipperAddress: 'Shanghai, China',
        bookingContactName: 'Alex',
        bookingContactEmail: 'alex@example.test',
      }),
    );
    await expect(
      runCustomer(tenantA, userA, customerA, () => service.submit(bookingA)),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_INCOMPLETE', details: { missing: ['dangerousGoodsInfo'] } },
    });
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(bookingA, { isDangerousGoods: false }),
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
    const revisionNotification = lastNotification('BOOKING_NEEDS_UPDATE');
    expect(revisionNotification).toMatchObject({
      tenantId: tenantA,
      customerCompanyId: customerA,
      payload: { bookingId: bookingA, href: `/portal/bookings/${bookingA}` },
    });
    expect(revisionNotification?.payload.bookingNo).toMatch(/^BOOK\d{12}$/);
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
    const versions = await runCustomer(tenantA, userA, customerA, () => service.listSubmissions(bookingA));
    expect(versions.map(row => row.version)).toEqual([2, 1]);
    expect(versions[1]?.snapshot).toMatchObject({ commodity: 'Consumer goods', shipperName: 'Example Shipper' });
    expect(versions[0]?.snapshot).toMatchObject({ commodity: 'Consumer electronics accessories' });
    expect(JSON.stringify(versions)).not.toMatch(/internalRemark|costAmount|sourceName|Commercial notes/);
    await prisma.customerCompany.update({ where: { id: customerA }, data: { name: 'Renamed Customer' } });
    expect(await runCustomer(tenantA, userA, customerA, () => service.listSubmissions(bookingA))).toEqual(versions);
    for (const [tenant, user, customerId] of [[tenantB, userB, customerB], [tenantA, userAOther, customerAOther]] as const) {
      await expect(runCustomer(tenant, user, customerId, () => service.listSubmissions(bookingA))).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
    }
    expect(customer.reviewActions.some((action) => action.action === 'REQUEST_REVISION')).toBe(
      true,
    );
    expect(
      await prisma.auditLog.count({
        where: { tenantId: tenantA, entityType: 'Booking', entityId: bookingA },
      }),
    ).toBeGreaterThanOrEqual(8);
  });

  it('blocks approval when cargo ready date is later than ETD', async () => {
    const quoteId = await createAcceptedQuote('LATE-CARGO', {
      etd: new Date('2026-09-09T00:00:00.000Z'),
      quantity: 2,
    });
    const booking = await runCustomer(tenantA, userA, customerA, () => service.create({ quoteId }));
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(booking.id, {
        commodity: 'Consumer goods',
        packageType: 'CARTON',
        packages: 10,
        grossWeight: '1000',
        cargoReadyDate: '2026-09-10',
        isDangerousGoods: false,
        shipperName: 'Example Shipper',
        shipperAddress: 'Shanghai, China',
        bookingContactName: 'Alex',
        bookingContactEmail: 'alex@example.test',
      }),
    );
    const concurrent = await Promise.allSettled([
      runCustomer(tenantA, userA, customerA, () => service.submit(booking.id)),
      runCustomer(tenantA, userA, customerA, () => service.submit(booking.id)),
    ]);
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.bookingSubmission.count({ where: { tenantId: tenantA, bookingId: booking.id } })).toBe(1);

    await expect(
      runInternal(() => service.approve(booking.id, { remark: 'Checked' })),
    ).rejects.toMatchObject({
      response: {
        code: 'BOOKING_REVIEW_BLOCKED',
        details: {
          reviewIssues: [
            expect.objectContaining({ code: 'CARGO_READY_AFTER_ETD', blocking: true }),
          ],
        },
      },
    });
    const detail = (await runInternal(() => service.getInternal(booking.id))) as Awaited<
      ReturnType<BookingsService['getInternal']>
    > & { reviewIssues: Array<{ code: string; blocking: boolean }> };
    expect(detail.reviewIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CARGO_READY_AFTER_ETD', blocking: true }),
      ]),
    );
  });

  it('allows approximate booking data to differ from the source quote and reports a warning', async () => {
    const quoteId = await createAcceptedQuote('MISMATCH', {
      etd: new Date('2026-09-12T00:00:00.000Z'),
      quantity: 2,
    });
    const booking = await runCustomer(tenantA, userA, customerA, () => service.create({ quoteId }));
    await prisma.bookingContainerRequest.updateMany({
      where: { tenantId: tenantA, bookingId: booking.id, containerType: '40HQ' },
      data: { quantity: 1 },
    });
    await runCustomer(tenantA, userA, customerA, () =>
      service.update(booking.id, {
        commodity: 'Consumer goods',
        packageType: 'CARTON',
        packages: 10,
        grossWeight: '1000',
        cargoReadyDate: '2026-09-10',
        isDangerousGoods: false,
        shipperName: 'Example Shipper',
        shipperAddress: 'Shanghai, China',
        bookingContactName: 'Alex',
        bookingContactEmail: 'alex@example.test',
      }),
    );
    await runCustomer(tenantA, userA, customerA, () => service.submit(booking.id));

    const detail = (await runInternal(() => service.getInternal(booking.id))) as Awaited<
      ReturnType<BookingsService['getInternal']>
    > & { reviewIssues: Array<{ code: string; blocking: boolean }> };
    expect(detail.reviewIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BOOKING_QUOTE_DIFFERENCE', blocking: false }),
      ]),
    );
    await expect(
      runInternal(() => service.approve(booking.id, { remark: 'Checked' })),
    ).resolves.toMatchObject({
      status: BookingStatus.APPROVED,
    });
  });

  it('allows shipment creation from an internal SO while keeping SO publication separate', async () => {
    await prisma.booking.update({
      where: { id: bookingA },
      data: { status: BookingStatus.BOOKED },
    });
    await expect(
      runInternal(() => service.createShipment(bookingA, { vessel: 'Demo Vessel' })),
    ).rejects.toMatchObject({
      response: { code: 'BOOKED_BOOKING_WITH_REGISTERED_SO_NOT_FOUND' },
    });
    await prisma.booking.update({
      where: { id: bookingA },
      data: { status: BookingStatus.BOOKING_SUBMITTED },
    });
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
          eta: '2026-10-12T16:30:00+08:00',
          cyCutoffAt: '2026-09-25T16:30:00+08:00',
          siCutoffAt: '2026-09-24T10:15:00+08:00',
          vgmCutoffAt: '2026-09-25T09:45:00+08:00',
          terminal: '测试码头',
          receivedAt: '2026-09-22T08:30:00+08:00',
        },
        soFile('shipping-order-v1.pdf'),
      ),
    );
    expect(draft).toMatchObject({ status: 'INTERNAL_DRAFT', version: 1 });
    expect(draft.receivedAt.toISOString()).toBe('2026-09-22T00:30:00.000Z');
    expect(draft.cyCutoffAt?.toISOString()).toBe('2026-09-25T08:30:00.000Z');
    expect(draft.siCutoffAt?.toISOString()).toBe('2026-09-24T02:15:00.000Z');
    expect(draft.vgmCutoffAt?.toISOString()).toBe('2026-09-25T01:45:00.000Z');
    expect(draft.terminal).toBe('测试码头');
    expect(draft.document.customerVisible).toBe(false);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingA } })).status).toBe(
      BookingStatus.BOOKED,
    );
    expect(
      await runCustomer(tenantA, userA, customerA, () => bookingSo.listCustomer(bookingA)),
    ).toEqual([]);
    await expect(
      runCustomer(tenantA, userA, customerA, () => documents.download(draft.document.id)),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } });
    const creations = await Promise.allSettled([
      runInternal(() => service.createShipment(bookingA, { vessel: 'Untrusted browser vessel', voyage: 'BAD', eta: '2030-01-01T00:00:00Z' })),
      runInternal(() => service.createShipment(bookingA, { soRecordId: draft.id })),
    ]);
    expect(creations.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { tenantId: tenantA, bookingId: bookingA } });
    expect(shipment).toMatchObject({ vessel: 'Demo Vessel', voyage: 'DV001', etd: null, eta: new Date('2026-10-12T08:30:00Z') });
    expect(await prisma.shipment.count({ where: { tenantId: tenantA, bookingId: bookingA } })).toBe(1);
    expect(shipment.bookingId).toBe(bookingA);
    expect(lastNotification('SHIPMENT_CREATED')).toMatchObject({
      tenantId: tenantA,
      customerCompanyId: customerA,
      payload: {
        bookingId: bookingA,
        shipmentId: shipment.id,
        href: `/portal/shipments/${shipment.id}`,
      },
    });
    const published = await runInternal(() => bookingSo.publish(bookingA, draft.id));
    expect(published).toMatchObject({ status: 'PUBLISHED', version: 1 });
    expect(lastNotification('SO_PUBLISHED')).toMatchObject({
      tenantId: tenantA,
      customerCompanyId: customerA,
      payload: { bookingId: bookingA, soRecordId: draft.id, href: `/portal/bookings/${bookingA}` },
    });
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
    expect(beforeReplacementPublish[0]).not.toHaveProperty('sourceName');
    expect(beforeReplacementPublish[0]).not.toHaveProperty('uploadedBy');
    expect((await runInternal(() => bookingSo.listInternal(bookingA)))[0]).toHaveProperty('sourceName');
    const difference = await runInternal(() => shipments.confirmationDifference(shipment.id));
    expect(difference.confirmation?.id).toBe(replacement.id);
    expect(difference.differences.some(item => item.field === 'vessel')).toBe(true);
    const atd = new Date('2026-09-01T08:00:00Z');
    const ata = new Date('2026-09-10T08:00:00Z');
    // Legacy actual times must survive even when a record is still marked PLANNED.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { atd, ata } });
    const fresh = await runInternal(() => shipments.confirmationDifference(shipment.id));
    await expect(runInternal(() => shipments.syncConfirmation(shipment.id, { soRecordId: published.id, expectedUpdatedAt: fresh.shipment.updatedAt.toISOString(), fields: ['vessel'] }))).rejects.toMatchObject({ response: { code: 'SHIPMENT_CONFIRMATION_CONFLICT' } });
    await runInternal(() => shipments.syncConfirmation(shipment.id, { soRecordId: replacement.id, expectedUpdatedAt: fresh.shipment.updatedAt.toISOString(), fields: ['vessel'] }));
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({ vessel: null, voyage: 'DV001', atd, ata });
    await expect(runInternal(() => shipments.syncConfirmation(shipment.id, { soRecordId: replacement.id, expectedUpdatedAt: fresh.shipment.updatedAt.toISOString(), fields: ['voyage'] }))).rejects.toMatchObject({ response: { code: 'SHIPMENT_CONFIRMATION_CONFLICT' } });
    expect(await prisma.auditLog.findFirst({ where: { tenantId: tenantA, entityId: shipment.id, action: 'SYNC_BOOKING_CONFIRMATION' } })).toMatchObject({ beforeData: { vessel: 'Demo Vessel' }, afterData: { vessel: null, soRecordId: replacement.id } });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'DEPARTED' } });
    await expect(runInternal(() => shipments.syncConfirmation(shipment.id, { soRecordId: replacement.id, expectedUpdatedAt: fresh.shipment.updatedAt.toISOString(), fields: ['voyage'] }))).rejects.toMatchObject({ response: { code: 'SHIPMENT_SYNC_NOT_PLANNED' } });
    await expect(runCustomer(tenantA, userA, customerA, () => shipments.confirmationDifference(shipment.id))).rejects.toMatchObject({ response: { code: 'SHIPMENT_NOT_FOUND' } });
    await expect(context.run({ requestId: 'other-tenant', tenantId: tenantB, userId: userB, roles: [RoleCode.OPERATION] }, () => shipments.confirmationDifference(shipment.id))).rejects.toMatchObject({ response: { code: 'SHIPMENT_NOT_FOUND' } });
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

function lastNotification(type: string) {
  for (let index = notificationCalls.length - 1; index >= 0; index -= 1) {
    const input = notificationCalls[index];
    if (input?.type === type) return input;
  }
  return undefined;
}

async function createAcceptedQuote(suffix: string, options: { etd: Date; quantity: number }) {
  return (
    await prisma.quote.create({
      data: {
        tenantId: tenantA,
        quoteNo: `QT-${suffix}-${runId}`,
        customerCompanyId: customerA,
        status: QuoteStatus.ACCEPTED,
        polCode: 'CNSHA',
        podCode: 'USLAX',
        carrierCode: 'COSCO',
        etd: options.etd,
        validUntil: day(7),
        currency: 'USD',
        subtotal: new Prisma.Decimal(600).mul(options.quantity),
        totalAmount: new Prisma.Decimal(600).mul(options.quantity),
        items: {
          create: {
            tenantId: tenantA,
            chargeCode: 'OCEAN_FREIGHT',
            chargeName: 'Ocean freight',
            containerType: '40HQ',
            quantity: new Prisma.Decimal(options.quantity),
            unitPrice: new Prisma.Decimal(600),
            amount: new Prisma.Decimal(600).mul(options.quantity),
            currency: 'USD',
          },
        },
      },
      select: { id: true },
    })
  ).id;
}

function day(offset: number) {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
}
