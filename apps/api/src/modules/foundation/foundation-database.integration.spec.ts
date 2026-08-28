import { PrismaClient, RoleCode, UserType } from '@prisma/client';

const prisma = new PrismaClient();
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tenantIds: string[] = [];

describe('foundation database tenant isolation', () => {
  afterAll(async () => {
    if (tenantIds.length > 0) {
      await prisma.userRole.deleteMany({
        where: { user: { tenantId: { in: tenantIds } } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { tenantId: { in: tenantIds } } },
      });
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.customerContact.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.customerCompany.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.businessNumberCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }

    await prisma.$disconnect();
  });

  it('rejects cross-tenant customer membership and role assignment', async () => {
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({
        data: { code: `TEST-A-${testRunId}`, name: 'Tenant A' },
      }),
      prisma.tenant.create({
        data: { code: `TEST-B-${testRunId}`, name: 'Tenant B' },
      }),
    ]);
    tenantIds.push(tenantA.id, tenantB.id);

    const customerA = await prisma.customerCompany.create({
      data: {
        tenantId: tenantA.id,
        code: `CUSTOMER-${testRunId}`,
        name: 'Tenant A Customer',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          tenantId: tenantB.id,
          customerCompanyId: customerA.id,
          email: `cross-customer-${testRunId}@example.test`,
          passwordHash: 'not-a-real-password-hash',
          displayName: 'Cross Tenant Customer',
          userType: UserType.CUSTOMER,
        },
      }),
    ).rejects.toThrow();

    const [userB, roleA] = await Promise.all([
      prisma.user.create({
        data: {
          tenantId: tenantB.id,
          email: `internal-${testRunId}@example.test`,
          passwordHash: 'not-a-real-password-hash',
          displayName: 'Tenant B Internal User',
          userType: UserType.INTERNAL,
        },
      }),
      prisma.role.create({
        data: {
          tenantId: tenantA.id,
          code: RoleCode.SALES,
          name: 'Sales',
        },
      }),
    ]);

    await expect(
      prisma.userRole.create({
        data: { userId: userB.id, roleId: roleA.id },
      }),
    ).rejects.toThrow();
  });
});
