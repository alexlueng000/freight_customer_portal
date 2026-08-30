import { InvoiceStatus, RoleCode, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { InvoiceStateMachine } from './invoice-state-machine.js';
import { InvoicesService } from './invoices.service.js';
import { DocumentsService } from '../bookings/documents.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const service = new InvoicesService(prisma, context, new InvoiceStateMachine(), {
  enqueueMany: () => Promise.resolve(),
} as never);
const storage = {
  upload: jest.fn().mockResolvedValue(undefined),
  download: jest.fn().mockResolvedValue(Buffer.from('invoice-pdf')),
  remove: jest.fn().mockResolvedValue(undefined),
};
const documents = new DocumentsService(prisma, context, storage as never);
const tenantIds: string[] = [];
let tenantA: string;
let tenantB: string;
let customerA: string;
let customerB: string;
let internalA: string;
let customerUserA: string;
let customerUserB: string;
let shipmentA: string;

describe('invoice database integration', () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({
        data: { code: `INV-A-${runId}`, name: 'Invoice A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `INV-B-${runId}`, name: 'Invoice B', status: 'ACTIVE' },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
    tenantIds.push(a.id, b.id);
    customerA = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantA, code: 'A', name: 'Customer A' },
      })
    ).id;
    customerB = (
      await prisma.customerCompany.create({
        data: { tenantId: tenantB, code: 'B', name: 'Customer B' },
      })
    ).id;
    internalA = (await user(tenantA, undefined, 'internal', UserType.INTERNAL)).id;
    customerUserA = (await user(tenantA, customerA, 'customer-a', UserType.CUSTOMER)).id;
    customerUserB = (await user(tenantB, customerB, 'customer-b', UserType.CUSTOMER)).id;
    const booking = await prisma.booking.create({
      data: {
        tenantId: tenantA,
        bookingNo: `BOOK-${runId}`,
        customerCompanyId: customerA,
        status: 'SO_RELEASED',
        polCode: 'CNSHA',
        podCode: 'USLGB',
      },
    });
    shipmentA = (
      await prisma.shipment.create({
        data: {
          tenantId: tenantA,
          shipmentNo: `SHP-${runId}`,
          bookingId: booking.id,
          customerCompanyId: customerA,
          polCode: 'CNSHA',
          podCode: 'USLGB',
          createdById: internalA,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.document.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.invoiceLine.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.businessNumberCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('creates formula-derived totals and enforces tenant/customer scope through the lifecycle', async () => {
    const invoice = await run(tenantA, internalA, undefined, [RoleCode.FINANCE], () =>
      service.create({
        shipmentId: shipmentA,
        currency: 'USD',
        taxAmount: '25.00',
        dueDate: '2026-10-01',
        lines: [
          {
            chargeCode: 'OCEAN_FREIGHT',
            description: 'Ocean freight',
            quantity: '2',
            unitPrice: '600.00',
          },
        ],
      }),
    );
    expect(invoice.invoiceNo).toMatch(/^INV\d{12}$/);
    expect(invoice.subtotal.toString()).toBe('1200');
    expect(invoice.totalAmount.toString()).toBe('1225');
    expect(invoice.lines[0]).toMatchObject({ chargeCode: 'OCEAN_FREIGHT', currency: 'USD' });
    await expect(
      run(tenantB, customerUserB, customerB, [RoleCode.CUSTOMER_USER], () =>
        service.get(invoice.id),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVOICE_NOT_FOUND' } });
    await run(tenantA, internalA, undefined, [RoleCode.FINANCE], () => service.issue(invoice.id));
    expect(
      await prisma.notification.count({
        where: { tenantId: tenantA, recipientUserId: customerUserA, type: 'INVOICE_ISSUED' },
      }),
    ).toBe(2);
    const attachment = await run(tenantA, internalA, undefined, [RoleCode.FINANCE], () =>
      documents.uploadForInvoice(invoice.id, {
        fieldname: 'file',
        originalname: 'invoice.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 11,
        buffer: Buffer.from('invoice-pdf'),
        stream: undefined as never,
        destination: '',
        filename: '',
        path: '',
      }),
    );
    expect(attachment).toMatchObject({
      invoiceId: invoice.id,
      documentType: 'INVOICE',
      version: 1,
      customerVisible: true,
    });
    expect(
      await run(tenantA, customerUserA, customerA, [RoleCode.CUSTOMER_USER], () =>
        documents.listForInvoice(invoice.id),
      ),
    ).toHaveLength(1);
    await expect(
      run(tenantB, customerUserB, customerB, [RoleCode.CUSTOMER_USER], () =>
        documents.download(attachment.id),
      ),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } });
    const confirmed = await run(tenantA, customerUserA, customerA, [RoleCode.CUSTOMER_USER], () =>
      service.confirm(invoice.id),
    );
    expect(confirmed.status).toBe(InvoiceStatus.CUSTOMER_CONFIRMED);
    const paid = await run(tenantA, internalA, undefined, [RoleCode.FINANCE], () =>
      service.markPaid(invoice.id),
    );
    expect(paid.status).toBe(InvoiceStatus.PAID);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: tenantA, entityType: 'Invoice', entityId: invoice.id },
      }),
    ).toBe(4);
  });
});

function run<T>(
  tenantId: string,
  userId: string,
  customerCompanyId: string | undefined,
  roles: RoleCode[],
  action: () => Promise<T>,
) {
  return context.run(
    { requestId: `req-${runId}`, tenantId, userId, customerCompanyId, roles },
    action,
  );
}
function user(
  tenantId: string,
  customerCompanyId: string | undefined,
  prefix: string,
  userType: UserType,
) {
  return prisma.user.create({
    data: {
      tenantId,
      customerCompanyId,
      email: `${prefix}-${runId}@example.test`,
      passwordHash: 'unused',
      displayName: prefix,
      userType,
      status: UserStatus.ACTIVE,
    },
  });
}
