import { createHash } from 'node:crypto';
import { PrismaClient, RoleCode } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  ['tenant.manage', 'Manage tenant settings and branding'],
  ['user.read', 'View internal tenant users'],
  ['user.manage', 'Create and manage internal tenant users'],
  ['customer.read', 'View customer companies and contacts'],
  ['customer.manage', 'Create and manage customer companies and contacts'],
  ['customer_user.read', 'View customer users within the permitted customer scope'],
  ['customer_user.manage', 'Create and manage users within the permitted customer scope'],
  ['audit.read', 'View tenant audit logs'],
];

const rolePermissions = {
  [RoleCode.SUPER_ADMIN]: permissions.map(([code]) => code),
  [RoleCode.TENANT_ADMIN]: permissions.map(([code]) => code),
  [RoleCode.SALES]: ['customer.read', 'customer.manage', 'customer_user.read'],
  [RoleCode.OPERATION]: ['customer.read', 'customer_user.read'],
  [RoleCode.FINANCE]: ['customer.read'],
  [RoleCode.CUSTOMER_ADMIN]: [
    'customer.read',
    'customer_user.read',
    'customer_user.manage',
  ],
  [RoleCode.CUSTOMER_USER]: ['customer.read'],
};

const roleNames = {
  [RoleCode.SUPER_ADMIN]: 'Super Admin',
  [RoleCode.TENANT_ADMIN]: 'Tenant Admin',
  [RoleCode.SALES]: 'Sales',
  [RoleCode.OPERATION]: 'Operation',
  [RoleCode.FINANCE]: 'Finance',
  [RoleCode.CUSTOMER_ADMIN]: 'Customer Admin',
  [RoleCode.CUSTOMER_USER]: 'Customer User',
};

async function seedPermissions() {
  const records = new Map();

  for (const [code, description] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
    records.set(code, permission);
  }

  return records;
}

async function seedDemoTenant(permissionRecords) {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.info('Demo tenant skipped. Set SEED_DEMO_DATA=true to create local demo data.');
    return;
  }

  const tenant = await prisma.tenant.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: {
      code: 'DEMO',
      name: 'Demo Freight Forwarder',
      status: 'TRIAL',
      timezone: 'Asia/Shanghai',
      defaultCurrency: 'USD',
    },
  });

  const roleRecords = new Map();

  for (const code of Object.values(RoleCode)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name: roleNames[code], isSystem: true },
      create: {
        tenantId: tenant.id,
        code,
        name: roleNames[code],
        isSystem: true,
      },
    });
    roleRecords.set(code, role);

    for (const permissionCode of rolePermissions[code]) {
      const permission = permissionRecords.get(permissionCode);
      if (!permission) {
        throw new Error(`Missing permission definition: ${permissionCode}`);
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const pepper = requireDemoSecret('PASSWORD_HASH_PEPPER');
  const adminPassword = requireDemoSecret('DEMO_ADMIN_PASSWORD');
  const customerPassword = requireDemoSecret('DEMO_CUSTOMER_PASSWORD');
  const customerCompany = await prisma.customerCompany.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'NORTHSTAR' } },
    update: { name: 'Northstar Trading Co., Ltd.', status: 'ACTIVE' },
    create: {
      tenantId: tenant.id,
      code: 'NORTHSTAR',
      name: 'Northstar Trading Co., Ltd.',
      shortName: 'Northstar',
      countryCode: 'CN',
      status: 'ACTIVE',
    },
  });
  const admin = await upsertDemoUser({
    tenantId: tenant.id,
    email: 'admin@demo.freight.local',
    passwordHash: await hashDemoPassword(adminPassword, pepper),
    displayName: 'Demo Tenant Admin',
    userType: 'INTERNAL',
    roleId: requireRole(roleRecords, RoleCode.TENANT_ADMIN).id,
  });
  await upsertDemoUser({
    tenantId: tenant.id,
    customerCompanyId: customerCompany.id,
    email: 'customer@demo.freight.local',
    passwordHash: await hashDemoPassword(customerPassword, pepper),
    displayName: 'Demo Customer Admin',
    userType: 'CUSTOMER',
    roleId: requireRole(roleRecords, RoleCode.CUSTOMER_ADMIN).id,
  });

  console.info(`Demo users ready for tenant ${tenant.code}: ${admin.email} and customer@demo.freight.local`);
}

function requireDemoSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 8) {
    throw new Error(`${name} must be set to at least 8 characters when SEED_DEMO_DATA=true`);
  }
  return value;
}

function requireRole(roleRecords, code) {
  const role = roleRecords.get(code);
  if (!role) throw new Error(`Missing demo role: ${code}`);
  return role;
}

async function hashDemoPassword(password, pepper) {
  const prehash = createHash('sha256').update(password).update(pepper).digest('base64url');
  return hash(prehash, 12);
}

async function upsertDemoUser({ roleId, ...userData }) {
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: userData.tenantId, email: userData.email } },
    update: { ...userData, status: 'ACTIVE' },
    create: { ...userData, status: 'ACTIVE' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId } },
    update: {},
    create: { userId: user.id, roleId },
  });
  return user;
}

async function main() {
  const permissionRecords = await seedPermissions();
  await seedDemoTenant(permissionRecords);
}

main()
  .then(() => {
    console.info('Seed completed.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
