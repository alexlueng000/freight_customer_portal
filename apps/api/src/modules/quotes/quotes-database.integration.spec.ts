import {
  CustomerStatus,
  MarkupType,
  Prisma,
  RateStatus,
  RoleCode,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { CustomerRatePricingService } from '../rates/customer-rate-pricing.service.js';
import { QuotesService } from './quotes.service.js';
import { QuoteStateMachine } from './quote-state-machine.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const service = new QuotesService(
  prisma,
  context,
  new CustomerRatePricingService(),
  new QuoteStateMachine(),
);
const tenantIds: string[] = [];
let tenantA: string,
  tenantB: string,
  customerA: string,
  customerB: string,
  userA: string,
  userB: string,
  internalUser: string,
  rateA: string;
let quoteId: string;
const cargoRequest = {
  cargoItems: [
    {
      commodity: 'Furniture',
      estimatedGrossWeight: 18000,
      cargoNature: 'General cargo',
      specialRequirement: 'Keep dry',
    },
    { commodity: 'Garments' },
  ],
  incoterm: 'FOB',
  pickupLocationText: 'Shanghai, China',
  deliveryLocationText: 'Los Angeles, USA',
  exportCustomsRemark: 'Export declaration required',
  importCustomsRemark: 'Importer will provide documents',
  customerRemarks: 'Please confirm free time',
  requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS', 'DESTINATION_DELIVERY'],
};

describe('quote database integration', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({
        data: { code: `QUOTE-A-${runId}`, name: 'Quote A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `QUOTE-B-${runId}`, name: 'Quote B', status: 'ACTIVE' },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
    tenantIds.push(a.id, b.id);
    customerA = (
      await prisma.customerCompany.create({
        data: {
          tenantId: tenantA,
          code: 'A',
          name: 'Customer A',
          status: CustomerStatus.ACTIVE,
          defaultMarkupType: MarkupType.FIXED,
          defaultMarkupValue: new Prisma.Decimal(100),
        },
      })
    ).id;
    customerB = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantB, code: 'B', name: 'Customer B', status: CustomerStatus.ACTIVE },
      })
    ).id;
    userA = (await createUser(tenantA, customerA, 'a')).id;
    userB = (await createUser(tenantB, customerB, 'b')).id;
    internalUser = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `internal-${runId}@example.test`,
          passwordHash: 'unused',
          displayName: 'Internal',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    rateA = (
      await prisma.rate.create({
        data: {
          tenantId: tenantA,
          rateNo: `RATE-${runId}`,
          polCode: 'CNSHA',
          polName: 'Shanghai',
          podCode: 'USLAX',
          podName: 'Los Angeles',
          carrierCode: 'COSCO',
          serviceName: 'Pacific Express',
          effectiveDate: day(-1),
          expiryDate: day(30),
          transitDays: 18,
          supplierName: 'Demo Supplier',
          contractNo: 'SC-2026',
          currency: 'USD',
          status: RateStatus.ACTIVE,
          prices: {
            create: {
              tenantId: tenantA,
              containerType: '40HQ',
              costAmount: new Prisma.Decimal(1000),
              sellAmount: new Prisma.Decimal(1200),
              currency: 'USD',
            },
          },
        },
      })
    ).id;
    await prisma.rateCharge.createMany({
      data: [
        {
          tenantId: tenantA,
          rateId: rateA,
          chargeCode: 'DOC',
          chargeName: 'Document fee',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(20),
          currency: 'USD',
        },
        {
          tenantId: tenantA,
          rateId: rateA,
          chargeCode: 'THC',
          chargeName: 'Terminal handling',
          chargeBasis: 'PER_CONTAINER',
          containerType: '40HQ',
          amount: new Prisma.Decimal(40),
          currency: 'USD',
        },
        {
          tenantId: tenantA,
          rateId: rateA,
          chargeCode: 'INC',
          chargeName: 'Included',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(999),
          currency: 'USD',
          isIncluded: true,
        },
        {
          tenantId: tenantA,
          rateId: rateA,
          chargeCode: 'EUR',
          chargeName: 'Other currency',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(50),
          currency: 'EUR',
        },
      ],
    });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quoteItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.quote.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.businessNumberCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rateCharge.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ratePrice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('creates immutable snapshots while hiding the unpublished formal quote from customer reads', async () => {
    const created = await runAs(tenantA, userA, customerA, () =>
      service.create({
        rateId: rateA,
        containerType: '40HQ',
        containerQuantity: 2,
        ...cargoRequest,
      }),
    );
    expect(created.quoteNo).toMatch(/^QT\d{12}$/);
    quoteId = created.id;
    expect(created.totalAmount.toString()).toBe('2700');
    await expect(
      runAs(tenantA, userA, customerA, () => service.getPdfJobData(created.id, false)),
    ).rejects.toMatchObject({ response: { code: 'QUOTE_NOT_SENT' } });
    await prisma.ratePrice.update({
      where: { rateId_containerType: { rateId: rateA, containerType: '40HQ' } },
      data: { costAmount: new Prisma.Decimal(9999), sellAmount: new Prisma.Decimal(9999) },
    });
    const detail = await runAs(tenantA, userA, customerA, () => service.get(created.id));
    expect(detail.items).toEqual([]);
    expect(detail.totalAmount).toBeNull();
    expect(detail.customerTerms).toBeNull();
    expect(detail.requestContainerType).toBe('40HQ');
    expect(detail).toMatchObject({
      containerQuantity: 2,
      incoterm: 'FOB',
      pickupLocationText: 'Shanghai, China',
      deliveryLocationText: 'Los Angeles, USA',
      exportCustomsRemark: 'Export declaration required',
      importCustomsRemark: 'Importer will provide documents',
      customerRemarks: 'Please confirm free time',
      requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS', 'DESTINATION_DELIVERY'],
      cargoItems: [
        {
          commodity: 'Furniture',
          estimatedGrossWeight: new Prisma.Decimal(18000),
          cargoNature: 'General cargo',
          specialRequirement: 'Keep dry',
        },
        {
          commodity: 'Garments',
          estimatedGrossWeight: null,
          cargoNature: null,
          specialRequirement: null,
        },
      ],
    });
    expect(JSON.stringify(detail)).not.toContain('costAmount');
    expect(JSON.stringify(detail)).not.toContain('supplierName');
    expect(JSON.stringify(detail)).not.toContain('contractNo');
    const stored = await prisma.quoteItem.findFirstOrThrow({ where: { quoteId: created.id } });
    expect(stored.costAmount?.toString()).toBe('1000');
    expect(stored.chargeBasis).toBe('PER_CONTAINER');
  });
  it('blocks cross-customer and cross-tenant quote access', async () => {
    const own = await runAs(tenantA, userA, customerA, () =>
      service.list({ page: 1, pageSize: 20 }),
    );
    expect(own.items).toHaveLength(1);
    expect(own.items[0]?.totalAmount).toBeNull();
    await expect(
      runAs(tenantB, userB, customerB, () => service.get(own.items[0]!.id)),
    ).rejects.toMatchObject({ response: { code: 'QUOTE_NOT_FOUND' } });
    await expect(
      runAs(tenantB, userB, customerB, () =>
        service.create({
          rateId: rateA,
          containerType: '40HQ',
          containerQuantity: 1,
          ...cargoRequest,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'RATE_NOT_AVAILABLE' } });
    try {
      await runAs(tenantA, userA, customerA, () =>
        service.create({
          rateId: rateA,
          containerType: '20GP',
          containerQuantity: 1,
          ...cargoRequest,
        }),
      );
      throw new Error('Expected rate price validation to fail');
    } catch (caught) {
      const response = errorResponse(caught);
      expect(response.code).toBe('RATE_PRICE_NOT_AVAILABLE');
      expect(response.details?.fieldErrors?.containerType).toHaveLength(1);
    }
  });
  it('opens historical quotes that predate the new request fields', async () => {
    const historical = await prisma.quote.create({
      data: {
        tenantId: tenantA,
        quoteNo: `QT-HIST-${runId}`,
        customerCompanyId: customerA,
        status: 'SENT',
        polCode: 'CNSHA',
        podCode: 'USLAX',
        carrierCode: 'COSCO',
        validUntil: day(10),
        currency: 'USD',
        subtotal: new Prisma.Decimal(1200),
        totalAmount: new Prisma.Decimal(1200),
        sentAt: new Date(),
        createdById: internalUser,
        updatedById: internalUser,
      },
    });

    const customerDetail = await runAs(tenantA, userA, customerA, () =>
      service.get(historical.id),
    );
    const salesDetail = await runInternal(() => service.getInternal(historical.id));
    expect(customerDetail).toMatchObject({
      id: historical.id,
      cargoItems: [],
      containerQuantity: null,
      incoterm: null,
      pickupLocationText: null,
      deliveryLocationText: null,
      requestedServices: [],
    });
    expect(salesDetail).toMatchObject({ id: historical.id, cargoItems: [] });
  });
  it('lets sales edit review terms and validity without exposing internal notes', async () => {
    await expect(
      runInternal(() =>
        service.updateReview(quoteId, {
          validUntil: day(31).toISOString().slice(0, 10),
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'QUOTE_VALID_UNTIL_EXCEEDS_RATE' },
    });

    const updated = await runInternal(() =>
      service.updateReview(quoteId, {
        validUntil: day(10).toISOString().slice(0, 10),
        customerTerms: 'Subject to space and equipment availability.',
        internalNote: 'Matched competitor lane offer.',
      }),
    );
    expect(updated.validUntil.toISOString().slice(0, 10)).toBe(day(10).toISOString().slice(0, 10));
    expect(updated.customerTerms).toBe('Subject to space and equipment availability.');
    expect(updated.internalNote).toBe('Matched competitor lane offer.');

    const customerDetail = await runAs(tenantA, userA, customerA, () => service.get(quoteId));
    expect(customerDetail.customerTerms).toBeNull();
    expect(JSON.stringify(customerDetail)).not.toContain('internalNote');
    expect(JSON.stringify(customerDetail)).not.toContain('Matched competitor lane offer');
  });
  it('allows an internal user to override draft prices with an audit trail', async () => {
    const internalDetail = await runInternal(() => service.getInternal(quoteId));
    expect(internalDetail.sourceRate).toMatchObject({
      rateNo: `RATE-${runId}`,
      supplierName: 'Demo Supplier',
      contractNo: 'SC-2026',
    });
    expect(internalDetail).toMatchObject({
      containerQuantity: 2,
      incoterm: 'FOB',
      pickupLocationText: 'Shanghai, China',
      deliveryLocationText: 'Los Angeles, USA',
      exportCustomsRemark: 'Export declaration required',
      importCustomsRemark: 'Importer will provide documents',
      customerRemarks: 'Please confirm free time',
      requestedServices: ['ORIGIN_PICKUP', 'EXPORT_CUSTOMS', 'DESTINATION_DELIVERY'],
      cargoItems: [
        {
          commodity: 'Furniture',
          cargoNature: 'General cargo',
          specialRequirement: 'Keep dry',
        },
        {
          commodity: 'Garments',
          estimatedGrossWeight: null,
          cargoNature: null,
          specialRequirement: null,
        },
      ],
    });
    const item = await prisma.quoteItem.findFirstOrThrow({
      where: { quoteId, chargeCode: 'OCEAN_FREIGHT' },
    });
    const updated = await runInternal(() =>
      service.overridePrices(quoteId, {
        reason: 'Approved sales adjustment',
        customerTerms: '增加提货服务，费用范围以本报价明细为准。',
        items: [{ itemId: item.id, unitPrice: '1400' }],
      }),
    );
    expect(updated.totalAmount.toString()).toBe('2900');
    expect(updated.version).toBe(2);
    expect((await runInternal(() => service.getInternal(quoteId))).customerTerms).toBe('增加提货服务，费用范围以本报价明细为准。');
    const stored = await prisma.quoteItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stored.originalUnitPrice?.toString()).toBe('1300');
    expect(stored.unitPrice.toString()).toBe('1400');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenantA, entityId: quoteId, action: 'PRICE_OVERRIDE' },
    });
    expect(audit.afterData).toMatchObject({
      reason: 'Approved sales adjustment',
      totalAmount: '2900',
    });
  });
  it('enforces send, viewed and accept transitions with idempotent acceptance', async () => {
    await runInternal(() => service.send(quoteId));
    const sentQuote = await runInternal(() => service.getInternal(quoteId));
    const visible = await runAs(tenantA, userA, customerA, () => service.get(quoteId));
    expect(visible.customerTerms).toBe('增加提货服务，费用范围以本报价明细为准。');
    expect(JSON.stringify(visible)).not.toContain('Approved sales adjustment');
    const pdf = await runAs(tenantA, userA, customerA, () => service.getPdfJobData(quoteId, false));
    expect(JSON.stringify(pdf)).toContain('增加提货服务，费用范围以本报价明细为准。');
    expect(JSON.stringify(pdf)).not.toContain('Approved sales adjustment');
    expect(sentQuote.sentAt).toBeDefined();
    expect(sentQuote.sentBy).toMatchObject({ id: internalUser });
    try {
      await runInternal(() =>
        service.overridePrices(quoteId, {
          reason: 'Too late',
          items: [{ itemId: 'missing-item', unitPrice: '1' }],
        }),
      );
      throw new Error('Expected status validation to fail');
    } catch (caught) {
      const response = errorResponse(caught);
      expect(response.code).toBe('QUOTE_PRICE_OVERRIDE_NOT_ALLOWED');
      expect(response.details?.fieldErrors?.status).toHaveLength(1);
    }
    const viewed = await runAs(tenantA, userA, customerA, () => service.get(quoteId));
    expect(viewed.status).toBe('VIEWED');
    expect(viewed.totalAmount?.toString()).toBe('2900');
    expect(viewed.items.map((item) => item.amount.toString())).toEqual(['2800', '20', '80']);
    expect(viewed.customerTerms).toBe('增加提货服务，费用范围以本报价明细为准。');
    const accepted = await runAs(tenantA, userA, customerA, () => service.accept(quoteId));
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptedAt).toBeDefined();
    const repeated = await runAs(tenantA, userA, customerA, () => service.accept(quoteId));
    expect(repeated.status).toBe('ACCEPTED');
    await expect(
      runAs(tenantA, userA, customerA, () => service.reject(quoteId)),
    ).rejects.toMatchObject({ response: { code: 'ILLEGAL_QUOTE_TRANSITION' } });
  });
  it('returns linked booking and shipment progress to both quote detail audiences', async () => {
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'BOOKED', bookedAt: new Date() },
    });
    const booking = await prisma.booking.create({
      data: {
        tenantId: tenantA,
        bookingNo: `BOOK-FLOW-${runId}`,
        quoteId,
        customerCompanyId: customerA,
        status: 'BOOKED',
        polCode: 'CNSHA',
        podCode: 'USLAX',
      },
    });
    const shipment = await prisma.shipment.create({
      data: {
        tenantId: tenantA,
        shipmentNo: `SHP-FLOW-${runId}`,
        bookingId: booking.id,
        customerCompanyId: customerA,
        status: 'DEPARTED',
        polCode: 'CNSHA',
        podCode: 'USLAX',
      },
    });

    const internalDetail = await runInternal(() => service.getInternal(quoteId));
    const customerDetail = await runAs(tenantA, userA, customerA, () => service.get(quoteId));
    const expectedProgress = [
      {
        id: booking.id,
        status: 'BOOKED',
        shipments: [{ id: shipment.id, status: 'DEPARTED' }],
      },
    ];
    expect(internalDetail.bookings).toEqual(expectedProgress);
    expect(customerDetail.bookings).toEqual(expectedProgress);
  });
  it('expires overdue quotes before a customer can accept them', async () => {
    const created = await runAs(tenantA, userA, customerA, () =>
      service.create({
        rateId: rateA,
        containerType: '40HQ',
        containerQuantity: 1,
        ...cargoRequest,
      }),
    );
    await runInternal(() => service.send(created.id));
    await prisma.quote.update({ where: { id: created.id }, data: { validUntil: day(-1) } });
    await expect(
      runAs(tenantA, userA, customerA, () => service.accept(created.id)),
    ).rejects.toMatchObject({ response: { code: 'ILLEGAL_QUOTE_TRANSITION' } });
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      'EXPIRED',
    );
  });
});
function runAs<T>(
  tenantId: string,
  userId: string,
  customerCompanyId: string,
  fn: () => Promise<T>,
) {
  return context.run(
    { requestId: `quote-${runId}`, tenantId, userId, customerCompanyId, roles: [] },
    fn,
  );
}
function runInternal<T>(fn: () => Promise<T>) {
  return context.run(
    {
      requestId: `quote-internal-${runId}`,
      tenantId: tenantA,
      userId: internalUser,
      roles: [RoleCode.TENANT_ADMIN],
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
function errorResponse(error: unknown): {
  code?: string;
  details?: { fieldErrors?: Record<string, string[]> };
} {
  return (
    (
      error as {
        response?: { code?: string; details?: { fieldErrors?: Record<string, string[]> } };
      }
    ).response ?? {}
  );
}
