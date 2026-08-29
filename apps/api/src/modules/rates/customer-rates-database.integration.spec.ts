import {
  CustomerStatus,
  MarkupType,
  Prisma,
  RateStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { CustomerRatePricingService } from './customer-rate-pricing.service.js';
import { CustomerRatesService } from './customer-rates.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const service = new CustomerRatesService(prisma, context, new CustomerRatePricingService());
const tenantIds: string[] = [];
let tenantA: string,
  tenantB: string,
  fixedCustomer: string,
  percentCustomer: string,
  fixedUser: string,
  percentUser: string,
  internalUser: string;

describe('customer rate search database integration', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({
        data: { code: `SEARCH-A-${runId}`, name: 'Search A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `SEARCH-B-${runId}`, name: 'Search B', status: 'ACTIVE' },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
    tenantIds.push(a.id, b.id);
    fixedCustomer = (
      await prisma.customerCompany.create({
        data: {
          tenantId: tenantA,
          code: 'FIXED',
          name: 'Fixed Customer',
          status: CustomerStatus.ACTIVE,
          defaultMarkupType: MarkupType.FIXED,
          defaultMarkupValue: new Prisma.Decimal('100'),
        },
      })
    ).id;
    percentCustomer = (
      await prisma.customerCompany.create({
        data: {
          tenantId: tenantA,
          code: 'PERCENT',
          name: 'Percent Customer',
          status: CustomerStatus.ACTIVE,
          defaultMarkupType: MarkupType.PERCENT,
          defaultMarkupValue: new Prisma.Decimal('5'),
        },
      })
    ).id;
    [fixedUser, percentUser, internalUser] = (
      await Promise.all([
        createUser(tenantA, 'fixed', UserType.CUSTOMER, fixedCustomer),
        createUser(tenantA, 'percent', UserType.CUSTOMER, percentCustomer),
        createUser(tenantA, 'internal', UserType.INTERNAL),
      ])
    ).map((user) => user.id) as [string, string, string];
    const [visible] = await Promise.all([
      createRate(tenantA, 'VISIBLE', RateStatus.ACTIVE, '1000', '1200'),
      createRate(tenantA, 'NO-SELL', RateStatus.ACTIVE, '1000', null, '20GP'),
      createRate(tenantA, 'INACTIVE', RateStatus.INACTIVE, '700', '800'),
      createRate(tenantB, 'OTHER-TENANT', RateStatus.ACTIVE, '1', '2'),
    ]);
    await prisma.rateCharge.createMany({
      data: [
        {
          tenantId: tenantA,
          rateId: visible.id,
          chargeCode: 'DOC',
          chargeName: 'Document fee',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(20),
          currency: 'USD',
        },
        {
          tenantId: tenantA,
          rateId: visible.id,
          chargeCode: 'THC',
          chargeName: 'Terminal handling',
          chargeBasis: 'PER_CONTAINER',
          containerType: '40HQ',
          amount: new Prisma.Decimal(40),
          currency: 'USD',
        },
        {
          tenantId: tenantA,
          rateId: visible.id,
          chargeCode: 'INC',
          chargeName: 'Included',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(999),
          currency: 'USD',
          isIncluded: true,
        },
        {
          tenantId: tenantA,
          rateId: visible.id,
          chargeCode: 'CNY',
          chargeName: 'Other currency',
          chargeBasis: 'PER_BL',
          amount: new Prisma.Decimal(100),
          currency: 'CNY',
        },
      ],
    });
  });
  afterAll(async () => {
    await prisma.rateCharge.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ratePrice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });
  it('returns final fixed-markup sell price without cost or internal fields', async () => {
    const result = await runAs(tenantA, fixedUser, fixedCustomer, () =>
      service.search(query('40HQ')),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      oceanSellAmount: '1300',
      sellAmount: '1360',
      currency: 'USD',
      containerType: '40HQ',
    });
    expect(result.items[0]?.charges).toHaveLength(2);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('costAmount');
    expect(serialized).not.toContain('supplier');
    expect(serialized).not.toContain('contract');
    expect(serialized).not.toContain('remark');
  });
  it('uses customer-specific percentage markup and cost fallback', async () => {
    const result = await runAs(tenantA, percentUser, percentCustomer, () =>
      service.search(query('20GP')),
    );
    expect(result.items[0]?.sellAmount).toBe('1050');
  });
  it('does not return inactive or cross-tenant rates', async () => {
    const result = await runAs(tenantA, fixedUser, fixedCustomer, () =>
      service.search(query('40HQ')),
    );
    expect(result.pagination.total).toBe(1);
    expect(result.items.map((item) => item.id)).toHaveLength(1);
  });
  it('rejects internal accounts and invalid departure ranges', async () => {
    await expect(
      runAs(tenantA, internalUser, undefined, () => service.search(query('40HQ'))),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_RATE_SCOPE_REQUIRED' } });
    await expect(
      runAs(tenantA, fixedUser, fixedCustomer, () =>
        service.search({ ...query('40HQ'), etdFrom: '2026-10-01', etdTo: '2026-09-01' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DEPARTURE_RANGE' } });
  });
});
function query(containerType: string) {
  return {
    page: 1,
    pageSize: 20,
    polCode: 'CNSHA',
    podCode: 'USLAX',
    containerType,
    etdFrom: '2026-09-01',
    etdTo: '2026-09-30',
  };
}
function runAs<T>(
  tenantId: string,
  userId: string,
  customerCompanyId: string | undefined,
  fn: () => Promise<T>,
) {
  return context.run(
    { requestId: `search-${runId}`, tenantId, userId, customerCompanyId, roles: [] },
    fn,
  );
}
function createUser(
  tenantId: string,
  suffix: string,
  userType: UserType,
  customerCompanyId?: string,
) {
  return prisma.user.create({
    data: {
      tenantId,
      customerCompanyId,
      email: `${suffix}-${runId}@example.test`,
      passwordHash: 'unused',
      displayName: suffix,
      userType,
      status: UserStatus.ACTIVE,
    },
  });
}
function createRate(
  tenantId: string,
  rateNo: string,
  status: RateStatus,
  cost: string,
  sell: string | null,
  containerType = '40HQ',
) {
  return prisma.rate.create({
    data: {
      tenantId,
      rateNo: `${rateNo}-${runId}`,
      polCode: 'CNSHA',
      polName: 'Shanghai',
      podCode: 'USLAX',
      podName: 'Los Angeles',
      carrierCode: 'COSCO',
      effectiveDate: new Date('2026-09-01T00:00:00Z'),
      expiryDate: new Date('2026-09-30T00:00:00Z'),
      currency: 'USD',
      status,
      supplierName: 'SECRET SUPPLIER',
      contractNo: 'SECRET CONTRACT',
      prices: {
        create: {
          tenantId,
          containerType,
          costAmount: new Prisma.Decimal(cost),
          sellAmount: sell ? new Prisma.Decimal(sell) : null,
          currency: 'USD',
          remark: 'SECRET REMARK',
        },
      },
    },
  });
}
