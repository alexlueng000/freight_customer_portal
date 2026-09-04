import { ConfigService } from '@nestjs/config';
import { RoleCode, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { PasswordService } from '../auth/password.service.js';
import { UsersService } from './users.service.js';

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const prisma = new PrismaService();
const context = new RequestContextService();
const passwords = new PasswordService(
  new ConfigService({ PASSWORD_HASH_PEPPER: 'users-test-pepper-at-least-32-characters' }),
);
const users = new UsersService(prisma, passwords, context);
const tenantIds: string[] = [];
let tenantAId: string;
let tenantBId: string;
let actorId: string;
let customerAId: string;
let customerBId: string;
let tenantBUserEmail: string;
let tenantBUserId: string;
let internalUserId: string;
let customerAdminId: string;
let customerPeerId: string;

describe('users database integration', () => {
  beforeAll(async () => {
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({
        data: { code: `USER-A-${runId}`, name: 'User Tenant A', status: 'ACTIVE' },
      }),
      prisma.tenant.create({
        data: { code: `USER-B-${runId}`, name: 'User Tenant B', status: 'ACTIVE' },
      }),
    ]);
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantIds.push(tenantAId, tenantBId);
    await Promise.all(
      [tenantAId, tenantBId].flatMap((tenantId) =>
        [
          RoleCode.TENANT_ADMIN,
          RoleCode.SALES,
          RoleCode.CUSTOMER_ADMIN,
          RoleCode.CUSTOMER_USER,
        ].map((code) => prisma.role.create({ data: { tenantId, code, name: code } })),
      ),
    );
    const [customerA, customerB] = await Promise.all([
      prisma.customerCompany.create({
        data: { tenantId: tenantAId, code: 'A', name: 'Customer A' },
      }),
      prisma.customerCompany.create({
        data: { tenantId: tenantBId, code: 'B', name: 'Customer B' },
      }),
    ]);
    customerAId = customerA.id;
    customerBId = customerB.id;
    actorId = (
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `actor-${runId}@example.test`,
          passwordHash: 'not-used',
          displayName: 'Actor',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
    const customerAdminRole = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenantAId, code: RoleCode.CUSTOMER_ADMIN } },
      select: { id: true },
    });
    customerAdminId = (
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          customerCompanyId: customerAId,
          email: `customer-admin-${runId}@example.test`,
          passwordHash: 'not-used',
          displayName: 'Customer Admin',
          userType: UserType.CUSTOMER,
          status: UserStatus.ACTIVE,
          userRoles: { create: { roleId: customerAdminRole.id } },
        },
      })
    ).id;
    customerPeerId = (
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          customerCompanyId: customerAId,
          email: `customer-peer-${runId}@example.test`,
          passwordHash: 'not-used',
          displayName: 'Customer Peer',
          userType: UserType.CUSTOMER,
          status: UserStatus.ACTIVE,
          userRoles: { create: { roleId: customerAdminRole.id } },
        },
      })
    ).id;
    tenantBUserEmail = `outside-${runId}@example.test`.toLowerCase();
    tenantBUserId = (
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: tenantBUserEmail,
          passwordHash: 'not-used',
          displayName: 'Outside User',
          userType: UserType.INTERNAL,
          status: UserStatus.ACTIVE,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.userRole.deleteMany({ where: { user: { tenantId: { in: tenantIds } } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('creates internal and customer users with valid role and customer bindings', async () => {
    const internal = await runAs(() =>
      users.create({
        email: `sales-${runId}@example.test`,
        displayName: 'Sales User',
        initialPassword: 'InitialPassword!2026',
        userType: UserType.INTERNAL,
        roleCode: RoleCode.SALES,
        status: UserStatus.ACTIVE,
      }),
    );
    const customer = await runAs(() =>
      users.create({
        email: `customer-${runId}@example.test`,
        displayName: 'Customer User',
        initialPassword: 'InitialPassword!2026',
        userType: UserType.CUSTOMER,
        roleCode: RoleCode.CUSTOMER_ADMIN,
        customerCompanyId: customerAId,
        status: UserStatus.ACTIVE,
      }),
    );
    internalUserId = internal.id;

    expect(internal).toMatchObject({ userType: UserType.INTERNAL, customerCompanyId: null });
    expect(customer).toMatchObject({ userType: UserType.CUSTOMER, customerCompanyId: customerAId });
    expect(customer.userRoles[0]?.role.code).toBe(RoleCode.CUSTOMER_ADMIN);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenantAId, entityType: 'User', entityId: customer.id },
    });
    expect(JSON.stringify(audit.afterData)).not.toContain('InitialPassword');
  });

  it('rejects invalid role types and cross-tenant customer bindings', async () => {
    await expect(
      runAs(() =>
        users.create({
          email: `invalid-role-${runId}@example.test`,
          displayName: 'Invalid Role',
          initialPassword: 'InitialPassword!2026',
          userType: UserType.INTERNAL,
          roleCode: RoleCode.CUSTOMER_USER,
          status: UserStatus.ACTIVE,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_USER_ROLE' } });
    await expect(
      runAs(() =>
        users.create({
          email: `cross-tenant-${runId}@example.test`,
          displayName: 'Cross Tenant',
          initialPassword: 'InitialPassword!2026',
          userType: UserType.CUSTOMER,
          roleCode: RoleCode.CUSTOMER_USER,
          customerCompanyId: customerBId,
          status: UserStatus.ACTIVE,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CUSTOMER_COMPANY' } });
  });

  it('lists only users from the authenticated tenant without password hashes', async () => {
    const result = await runAs(() => users.list({ page: 1, pageSize: 100 }));
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(result.items.every((user) => !('passwordHash' in user))).toBe(true);
    expect(result.items.some((user) => user.email === tenantBUserEmail)).toBe(false);
  });

  it('lets customer admins manage only users in their own customer company', async () => {
    const listed = await runAsCustomerAdmin(() =>
      users.listPortalUsers({ page: 1, pageSize: 100, customerCompanyId: customerBId }),
    );
    expect(listed.items.every((user) => user.customerCompanyId === customerAId)).toBe(true);
    expect(listed.items.every((user) => user.userType === UserType.CUSTOMER)).toBe(true);
    expect(listed.items.some((user) => user.id === actorId)).toBe(false);

    const created = await runAsCustomerAdmin(() =>
      users.createPortalUser({
        email: `portal-created-${runId}@example.test`,
        displayName: 'Portal Created',
        initialPassword: 'InitialPassword!2026',
        userType: UserType.INTERNAL,
        roleCode: RoleCode.CUSTOMER_USER,
        customerCompanyId: customerBId,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(created).toMatchObject({
      userType: UserType.CUSTOMER,
      customerCompanyId: customerAId,
    });
    expect(created.userRoles[0]?.role.code).toBe(RoleCode.CUSTOMER_USER);

    const updated = await runAsCustomerAdmin(() =>
      users.updatePortalUser(customerPeerId, {
        roleCode: RoleCode.CUSTOMER_USER,
        status: UserStatus.DISABLED,
      }),
    );
    expect(updated.status).toBe(UserStatus.DISABLED);
    expect(updated.userRoles[0]?.role.code).toBe(RoleCode.CUSTOMER_USER);

    await expect(
      runAsCustomerAdmin(() => users.updatePortalUser(actorId, { status: UserStatus.DISABLED })),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
    await expect(
      runAsCustomerAdmin(() =>
        users.updatePortalUser(customerAdminId, { roleCode: RoleCode.CUSTOMER_USER }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_ADMIN_SELF_CHANGE_REJECTED' } });
  });

  it('updates status and role atomically and records before/after audit data', async () => {
    const updated = await runAs(() =>
      users.update(internalUserId, {
        roleCode: RoleCode.TENANT_ADMIN,
        status: UserStatus.DISABLED,
      }),
    );
    expect(updated.status).toBe(UserStatus.DISABLED);
    expect(updated.userRoles.map(({ role }) => role.code)).toEqual([RoleCode.TENANT_ADMIN]);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantAId,
        entityType: 'User',
        entityId: internalUserId,
        action: 'USER_UPDATED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.beforeData).toMatchObject({ status: UserStatus.ACTIVE, roleCode: RoleCode.SALES });
    expect(audit.afterData).toMatchObject({
      status: UserStatus.DISABLED,
      roleCode: RoleCode.TENANT_ADMIN,
    });
  });

  it('rejects cross-tenant updates and roles that do not match the user type', async () => {
    await expect(
      runAs(() => users.update(tenantBUserId, { status: UserStatus.DISABLED })),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
    await expect(
      runAs(() => users.update(internalUserId, { roleCode: RoleCode.CUSTOMER_ADMIN })),
    ).rejects.toMatchObject({ response: { code: 'INVALID_USER_ROLE' } });
  });
});

function runAs<T>(callback: () => Promise<T>): Promise<T> {
  return context.run(
    { requestId: `users-${runId}`, tenantId: tenantAId, userId: actorId, roles: [] },
    callback,
  );
}

function runAsCustomerAdmin<T>(callback: () => Promise<T>): Promise<T> {
  return context.run(
    {
      requestId: `customer-users-${runId}`,
      tenantId: tenantAId,
      userId: customerAdminId,
      customerCompanyId: customerAId,
      roles: [RoleCode.CUSTOMER_ADMIN],
    },
    callback,
  );
}
