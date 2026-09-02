import { ConfigService } from '@nestjs/config';
import { RoleCode, TenantStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'Correct-Horse-Battery-Staple!';
const tenantCode = `AUTH-${testRunId}`.toUpperCase();
const email = `auth-${testRunId}@example.test`;
const config = new ConfigService({
  AUTH_ACCESS_TOKEN_SECRET: 'test-access-secret-that-is-at-least-32-characters',
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_SECRET: 'test-refresh-secret-that-is-at-least-32-characters',
  AUTH_REFRESH_TOKEN_TTL_SECONDS: 604_800,
  PASSWORD_HASH_PEPPER: 'test-password-pepper-that-is-at-least-32-characters',
});
const prisma = new PrismaService();
const passwords = new PasswordService(config);
const tokens = new TokenService(config);
const auth = new AuthService(prisma, passwords, tokens);
let tenantId: string;

describe('auth database integration', () => {
  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { code: tenantCode, name: 'Auth Test Tenant', status: TenantStatus.ACTIVE },
    });
    tenantId = tenant.id;
    const role = await prisma.role.create({
      data: { tenantId, code: RoleCode.TENANT_ADMIN, name: 'Tenant Admin' },
    });
    const permission = await prisma.permission.create({
      data: { code: `auth.test.${testRunId}`, description: 'Auth test permission' },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: await passwords.hash(password),
        displayName: 'Auth Test User',
        userType: UserType.INTERNAL,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.refreshSession.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
      await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.role.deleteMany({ where: { tenantId } });
      await prisma.permission.deleteMany({ where: { code: `auth.test.${testRunId}` } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('logs in with tenant-scoped credentials and resolves the current database user', async () => {
    const session = await auth.login(
      { tenantCode: tenantCode.toLowerCase(), email: email.toUpperCase(), password },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(session.user.tenantId).toBe(tenantId);
    expect(session.user.roles).toEqual([RoleCode.TENANT_ADMIN]);
    expect(session.user.permissions).toEqual([`auth.test.${testRunId}`]);
    expect(tokens.verifyAccessToken(session.accessToken)).toMatchObject({
      sub: session.user.id,
      tenantId,
      tokenType: 'access',
    });
    await expect(auth.getAuthenticatedUser(tenantId, session.user.id)).resolves.toMatchObject({
      email,
      tenantCode,
    });
    await expect(auth.getAuthenticatedUser('another-tenant', session.user.id)).rejects.toThrow();
  });

  it('rotates refresh tokens and revokes the token family when an old token is reused', async () => {
    const first = await auth.login(
      { tenantCode, email, password },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
    const second = await auth.refresh(first.refreshToken, {
      ipAddress: '127.0.0.2',
      userAgent: 'jest-refresh',
    });

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(first.refreshToken, {})).rejects.toThrow();
    await expect(auth.refresh(second.refreshToken, {})).rejects.toThrow();
  });

  it('rejects an incorrect password without creating a session', async () => {
    const before = await prisma.refreshSession.count({ where: { tenantId } });
    await expect(
      auth.login({ tenantCode, email, password: 'incorrect-password' }, {}),
    ).rejects.toThrow();
    await expect(prisma.refreshSession.count({ where: { tenantId } })).resolves.toBe(before);
  });
});
