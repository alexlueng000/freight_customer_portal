import { QuoteStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { CustomerRatePricingService } from '../rates/customer-rate-pricing.service.js';
import { QuotesService } from './quotes.service.js';
import { QuoteStateMachine } from './quote-state-machine.js';
import type { ListQuotesDto } from './dto/list-quotes.dto.js';

const prisma = new PrismaService();
const context = new RequestContextService();
const service = new QuotesService(
  prisma,
  context,
  new CustomerRatePricingService(),
  new QuoteStateMachine(),
);
const tenantIds: string[] = [];
let tenantId: string;
let customerCompanyId: string;
const run = `${Date.now()}`;
const list = (filters: Partial<ListQuotesDto> = {}) =>
  context.run(
    {
      requestId: run,
      tenantId,
      customerCompanyId,
      userId: 'list-test',
      roles: [RoleCode.CUSTOMER_ADMIN],
    },
    () => service.list({ page: 1, pageSize: 1, ...filters }),
  );

describe('customer quote list filters with persistence', () => {
  beforeAll(async () => {
    for (let i = 0; i < 2; i++) {
      const tenant = await prisma.tenant.create({
        data: { code: `QFILTER-${run}-${i}`, name: 'Filter test' },
      });
      tenantIds.push(tenant.id);
      for (let j = 0; j < 2; j++) {
        const customer = await prisma.customerCompany.create({
          data: { tenantId: tenant.id, code: `C${j}`, name: 'Filter customer' },
        });
        if (i === 0 && j === 0) {
          tenantId = tenant.id;
          customerCompanyId = customer.id;
        }
        for (const [suffix, status, expired] of [
          ['ONE', QuoteStatus.SENT, false],
          ['TWO', QuoteStatus.VIEWED, false],
          ['OLD', QuoteStatus.SENT, true],
          ['ACCEPTED', QuoteStatus.ACCEPTED, true],
        ] as const) {
          await prisma.quote.create({
            data: {
              tenantId: tenant.id,
              customerCompanyId: customer.id,
              quoteNo: `FILTER-${j}-${suffix}`,
              polCode: 'CNXMN',
              podCode: 'THBKK',
              carrierCode: 'SITC',
              status,
              validUntil: new Date(expired ? '2000-01-01' : '2099-01-01'),
              currency: 'USD',
              subtotal: 10,
              totalAmount: 10,
              sentAt: new Date(),
            },
          });
        }
      }
    }
  });
  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });
  it('combines names, carrier and status before pagination without leaking other customers or tenants', async () => {
    const result = await list({
      pol: '厦门',
      pod: 'Bangkok',
      carrierCode: 'sitc',
      statuses: [QuoteStatus.SENT, QuoteStatus.VIEWED],
    });
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ polDisplayName: '厦门', podDisplayName: '曼谷' });
    const next = await list({
      pol: 'CNXMN',
      pod: '曼谷',
      statuses: [QuoteStatus.SENT, QuoteStatus.VIEWED],
      page: 2,
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).not.toBe(result.items[0]?.id);
  });
  it('filters effective expiry without expiring accepted quotes', async () => {
    const result = await list({ status: QuoteStatus.EXPIRED });
    expect(result.pagination.total).toBe(1);
    expect(result.items[0]).toMatchObject({ status: QuoteStatus.EXPIRED, quoteNo: 'FILTER-0-OLD' });
    expect((await list({ status: QuoteStatus.ACCEPTED })).pagination.total).toBe(1);
  });
  it('searches quote numbers and treats wildcard characters literally', async () => {
    expect((await list({ quoteNo: 'one' })).items[0]?.quoteNo).toBe('FILTER-0-ONE');
    expect((await list({ quoteNo: '%' })).pagination.total).toBe(0);
    expect((await list({ pol: '不存在' })).pagination.total).toBe(0);
  });
});
