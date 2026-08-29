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
          effectiveDate: day(-1),
          expiryDate: day(30),
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

  it('creates immutable cost and sell snapshots while hiding cost from customer reads', async () => {
    const created = await runAs(tenantA, userA, customerA, () =>
      service.create({ rateId: rateA, containerType: '40HQ' }),
    );
    expect(created.quoteNo).toMatch(/^QT\d{12}$/);
    quoteId = created.id;
    expect(created.totalAmount.toString()).toBe('1360');
    await prisma.ratePrice.update({
      where: { rateId_containerType: { rateId: rateA, containerType: '40HQ' } },
      data: { costAmount: new Prisma.Decimal(9999), sellAmount: new Prisma.Decimal(9999) },
    });
    const detail = await runAs(tenantA, userA, customerA, () => service.get(created.id));
    expect(detail.items.map((item) => item.amount.toString())).toEqual(['1300', '20', '40']);
    expect(detail.totalAmount.toString()).toBe('1360');
    expect(JSON.stringify(detail)).not.toContain('costAmount');
    const stored = await prisma.quoteItem.findFirstOrThrow({ where: { quoteId: created.id } });
    expect(stored.costAmount?.toString()).toBe('1000');
  });
  it('blocks cross-customer and cross-tenant quote access', async () => {
    const own = await runAs(tenantA, userA, customerA, () =>
      service.list({ page: 1, pageSize: 20 }),
    );
    expect(own.items).toHaveLength(1);
    await expect(
      runAs(tenantB, userB, customerB, () => service.get(own.items[0]!.id)),
    ).rejects.toMatchObject({ response: { code: 'QUOTE_NOT_FOUND' } });
    await expect(
      runAs(tenantB, userB, customerB, () =>
        service.create({ rateId: rateA, containerType: '40HQ' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'RATE_NOT_AVAILABLE' } });
  });
  it('allows an internal user to override draft prices with an audit trail', async () => {
    const item = await prisma.quoteItem.findFirstOrThrow({
      where: { quoteId, chargeCode: 'OCEAN_FREIGHT' },
    });
    const updated = await runInternal(() =>
      service.overridePrices(quoteId, {
        reason: 'Approved sales adjustment',
        items: [{ itemId: item.id, unitPrice: '1400' }],
      }),
    );
    expect(updated.totalAmount.toString()).toBe('1460');
    expect(updated.version).toBe(2);
    const stored = await prisma.quoteItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stored.originalUnitPrice?.toString()).toBe('1300');
    expect(stored.unitPrice.toString()).toBe('1400');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenantA, entityId: quoteId, action: 'PRICE_OVERRIDE' },
    });
    expect(audit.afterData).toMatchObject({
      reason: 'Approved sales adjustment',
      totalAmount: '1460',
    });
  });
  it('enforces send, viewed and accept transitions with idempotent acceptance', async () => {
    await runInternal(() => service.send(quoteId));
    const viewed = await runAs(tenantA, userA, customerA, () => service.get(quoteId));
    expect(viewed.status).toBe('VIEWED');
    const accepted = await runAs(tenantA, userA, customerA, () => service.accept(quoteId));
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptedAt).toBeDefined();
    const repeated = await runAs(tenantA, userA, customerA, () => service.accept(quoteId));
    expect(repeated.status).toBe('ACCEPTED');
    await expect(
      runAs(tenantA, userA, customerA, () => service.reject(quoteId)),
    ).rejects.toMatchObject({ response: { code: 'ILLEGAL_QUOTE_TRANSITION' } });
  });
  it('expires overdue quotes before a customer can accept them', async () => {
    const created = await runAs(tenantA, userA, customerA, () =>
      service.create({ rateId: rateA, containerType: '40HQ' }),
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
