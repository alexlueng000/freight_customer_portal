import { ChargeBasis, RateStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { RatesService } from './rates.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const rates = new RatesService(prisma, context);
const tenantIds: string[] = [];
let tenantA: string, tenantB: string, userA: string, userB: string, rateA: string;

describe('rates database integration', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({ data: { code: `RATE-A-${runId}`, name: 'Rate Tenant A', status: 'ACTIVE' } }),
      prisma.tenant.create({ data: { code: `RATE-B-${runId}`, name: 'Rate Tenant B', status: 'ACTIVE' } }),
    ]);
    tenantA = a.id; tenantB = b.id; tenantIds.push(a.id, b.id);
    const [createdUserA, createdUserB] = await Promise.all([createUser(tenantA, 'a'), createUser(tenantB, 'b')]);
    userA = createdUserA.id; userB = createdUserB.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rateCharge.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ratePrice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('creates nested prices and charges atomically and writes an audit record', async () => {
    const rate = await runAs(tenantA, userA, () => rates.create(input('SHARED')));
    rateA = rate.id;
    expect(rate.prices[0]).toMatchObject({ containerType: '40HQ', currency: 'USD' });
    expect(rate.prices[0]?.costAmount.toString()).toBe('1250');
    expect(rate.charges[0]).toMatchObject({ chargeCode: 'THC', chargeBasis: 'PER_CONTAINER' });
    await expect(prisma.auditLog.count({ where: { tenantId: tenantA, entityId: rate.id, action: 'RATE_CREATED' } })).resolves.toBe(1);
  });

  it('allows rate numbers across tenants but not within one tenant', async () => {
    await runAs(tenantB, userB, () => rates.create(input('SHARED')));
    await expect(runAs(tenantA, userA, () => rates.create(input('SHARED')))).rejects.toMatchObject({ response: { code: 'RATE_NUMBER_EXISTS' } });
  });

  it('does not reveal or update another tenant rate', async () => {
    await expect(runAs(tenantB, userB, () => rates.getById(rateA))).rejects.toMatchObject({ response: { code: 'RATE_NOT_FOUND' } });
    await expect(runAs(tenantB, userB, () => rates.update(rateA, { status: RateStatus.INACTIVE }))).rejects.toMatchObject({ response: { code: 'RATE_NOT_FOUND' } });
  });

  it('filters valid rates and replaces price sets with an audited before/after snapshot', async () => {
    const result = await runAs(tenantA, userA, () => rates.list({ page: 1, pageSize: 20, polCode: 'CNSHA', podCode: 'USLAX', containerType: '40HQ', validOn: '2026-09-15' }));
    expect(result.items.map((r) => r.id)).toContain(rateA);
    const updated = await runAs(tenantA, userA, () => rates.update(rateA, { prices: [{ containerType: '20GP', costAmount: '900.00', currency: 'USD' }] }));
    expect(updated.prices.map((p) => p.containerType)).toEqual(['20GP']);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: tenantA, entityId: rateA, action: 'RATE_UPDATED' } });
    expect(audit.beforeData).toBeTruthy(); expect(audit.afterData).toBeTruthy();
  });

  it('rejects invalid validity and charge/container combinations', async () => {
    await expect(runAs(tenantA, userA, () => rates.create({ ...input('BAD-DATE'), effectiveDate: '2026-10-01', expiryDate: '2026-09-01' }))).rejects.toMatchObject({ response: { code: 'INVALID_RATE_VALIDITY' } });
    await expect(runAs(tenantA, userA, () => rates.create({ ...input('BAD-CHARGE'), charges: [{ chargeCode: 'DOC', chargeName: 'Documentation', chargeBasis: ChargeBasis.PER_BL, containerType: '40HQ', amount: '50', currency: 'USD', isIncluded: false }] }))).rejects.toMatchObject({ response: { code: 'INVALID_RATE_CHARGE' } });
  });
});

function input(rateNo: string) {
  return { rateNo, polCode: 'CNSHA', polName: 'Shanghai', podCode: 'USLAX', podName: 'Los Angeles', carrierCode: 'COSCO', serviceName: 'Pacific', effectiveDate: '2026-09-01', expiryDate: '2026-09-30', transitDays: 18, supplierName: 'Demo Supplier', contractNo: 'SC-2026', currency: 'USD', status: RateStatus.ACTIVE, prices: [{ containerType: '40HQ', costAmount: '1250.0000', sellAmount: '1400.0000', currency: 'USD', remark: 'Base ocean freight' }], charges: [{ chargeCode: 'THC', chargeName: 'Terminal Handling', chargeBasis: ChargeBasis.PER_CONTAINER, containerType: '40HQ', amount: '100.0000', currency: 'USD', isIncluded: false }] };
}
function runAs<T>(tenantId: string, userId: string, fn: () => Promise<T>) { return context.run({ requestId: `rate-${runId}`, tenantId, userId, roles: [] }, fn); }
function createUser(tenantId: string, suffix: string) { return prisma.user.create({ data: { tenantId, email: `rate-${suffix}-${runId}@example.test`, passwordHash: 'unused', displayName: `Rate ${suffix}`, userType: UserType.INTERNAL, status: UserStatus.ACTIVE } }); }
