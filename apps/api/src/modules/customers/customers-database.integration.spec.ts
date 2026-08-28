import { CustomerStatus, MarkupType, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { CustomersService } from './customers.service.js';

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const requestContext = new RequestContextService();
const customers = new CustomersService(prisma, requestContext);
const tenantIds: string[] = [];
let tenantAId: string;
let tenantBId: string;
let adminAId: string;
let adminBId: string;
let customerUserId: string;
let customerAId: string;
let secondCustomerAId: string;
let customerBId: string;

describe('customers database integration', () => {
  beforeAll(async () => {
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({
        data: { code: `CUST-A-${testRunId}`, name: 'Customer Test Tenant A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `CUST-B-${testRunId}`, name: 'Customer Test Tenant B', status: 'ACTIVE' },
      }),
    ]);
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantIds.push(tenantAId, tenantBId);

    const [adminA, adminB] = await Promise.all([
      createUser(tenantAId, `admin-a-${testRunId}@example.test`, UserType.INTERNAL),
      createUser(tenantBId, `admin-b-${testRunId}@example.test`, UserType.INTERNAL),
    ]);
    adminAId = adminA.id;
    adminBId = adminB.id;
  });

  afterAll(async () => {
    if (tenantIds.length) {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.userRole.deleteMany({ where: { user: { tenantId: { in: tenantIds } } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.customerContact.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('allows the same customer code across tenants, audits creation, and rejects a duplicate within one tenant', async () => {
    customerAId = (
      await runAs(tenantAId, adminAId, undefined, () =>
        customers.create(customerInput('SHARED', 'Tenant A Customer')),
      )
    ).id;
    customerBId = (
      await runAs(tenantBId, adminBId, undefined, () =>
        customers.create(customerInput('SHARED', 'Tenant B Customer')),
      )
    ).id;
    secondCustomerAId = (
      await runAs(tenantAId, adminAId, undefined, () =>
        customers.create(customerInput('SECOND', 'Tenant A Second Customer')),
      )
    ).id;

    await expect(
      runAs(tenantAId, adminAId, undefined, () =>
        customers.create(customerInput('SHARED', 'Duplicate Customer')),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_CODE_EXISTS' } });

    await expect(
      prisma.auditLog.count({
        where: { tenantId: tenantAId, entityType: 'CustomerCompany', action: 'CUSTOMER_CREATED' },
      }),
    ).resolves.toBe(2);
  });

  it('does not reveal another tenant customer by identifier', async () => {
    await expect(
      runAs(tenantAId, adminAId, undefined, () => customers.getById(customerBId)),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
  });

  it('limits a customer user to its bound company inside the tenant', async () => {
    const customerUser = await createUser(
      tenantAId,
      `customer-${testRunId}@example.test`,
      UserType.CUSTOMER,
      customerAId,
    );
    customerUserId = customerUser.id;

    const result = await runAs(tenantAId, customerUserId, customerAId, () =>
      customers.list({ page: 1, pageSize: 20 }),
    );
    expect(result.items.map(({ id }) => id)).toEqual([customerAId]);
    await expect(
      runAs(tenantAId, customerUserId, customerAId, () => customers.getById(secondCustomerAId)),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
  });

  it('creates and audits a contact without copying email or phone into the audit payload', async () => {
    const contact = await runAs(tenantAId, adminAId, undefined, () =>
      customers.createContact(customerAId, {
        name: 'Primary Contact',
        email: 'PRIMARY@EXAMPLE.TEST',
        phone: '+86 138 0000 0000',
        roleTitle: 'Logistics Manager',
        isPrimary: true,
        isBookingContact: true,
        isDocumentContact: false,
      }),
    );

    expect(contact).toMatchObject({
      customerCompanyId: customerAId,
      email: 'primary@example.test',
      isPrimary: true,
      isBookingContact: true,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenantAId, entityType: 'CustomerContact', entityId: contact.id },
    });
    expect(audit.afterData).toMatchObject({ hasEmail: true, hasPhone: true });
    expect(JSON.stringify(audit.afterData)).not.toContain('primary@example.test');
    expect(JSON.stringify(audit.afterData)).not.toContain('138 0000 0000');
  });

  it('prevents cross-tenant and cross-customer contact access', async () => {
    await expect(
      runAs(tenantBId, adminBId, undefined, () => customers.listContacts(customerAId)),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
    await expect(
      runAs(tenantAId, customerUserId, customerAId, () =>
        customers.listContacts(secondCustomerAId),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
  });
});

function customerInput(code: string, name: string) {
  return {
    code,
    name,
    creditLimit: '10000.0000',
    paymentTermDays: 30,
    defaultMarkupType: MarkupType.PERCENT,
    defaultMarkupValue: '5.2500',
    status: CustomerStatus.ACTIVE,
  };
}

function runAs<T>(
  tenantId: string,
  userId: string,
  customerCompanyId: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  return requestContext.run(
    { requestId: `test-${testRunId}`, tenantId, userId, customerCompanyId, roles: [] },
    callback,
  );
}

function createUser(
  tenantId: string,
  email: string,
  userType: UserType,
  customerCompanyId?: string,
) {
  return prisma.user.create({
    data: {
      tenantId,
      customerCompanyId,
      email,
      passwordHash: 'not-used-in-this-test',
      displayName: email,
      userType,
      status: UserStatus.ACTIVE,
    },
  });
}
