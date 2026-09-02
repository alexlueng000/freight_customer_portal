import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RoleCode, TenantStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import type {
  AuthenticatedUser,
  IssuedAuthSession,
  SessionMetadata,
} from './auth.types.js';

const loginUserInclude = {
  tenant: true,
  userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto, metadata: SessionMetadata): Promise<IssuedAuthSession> {
    const tenantCode = dto.tenantCode.trim().toUpperCase();
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { tenant: { code: tenantCode }, email: { equals: email, mode: 'insensitive' } },
      include: loginUserInclude,
    });

    if (!user || !(await this.passwords.verify(dto.password, user.passwordHash))) {
      throw this.invalidCredentials();
    }
    this.assertUserCanAuthenticate(user.status, user.tenant.status);

    const authenticatedUser = this.toAuthenticatedUser(user);
    const session = await this.createSession(authenticatedUser, metadata);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.id,
          entityType: 'USER',
          entityId: user.id,
          action: 'LOGIN_SUCCESS',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ]);

    return session;
  }

  async refresh(refreshToken: string, metadata: SessionMetadata): Promise<IssuedAuthSession> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const current = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: { include: loginUserInclude } },
    });
    if (!current) {
      throw this.invalidRefreshToken();
    }

    if (current.revokedAt) {
      await this.revokeFamily(current.tenantId, current.familyId, 'TOKEN_REUSE_DETECTED');
      throw this.invalidRefreshToken();
    }
    if (current.expiresAt <= new Date()) {
      await this.prisma.refreshSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), revokedReason: 'EXPIRED' },
      });
      throw this.invalidRefreshToken();
    }

    this.assertUserCanAuthenticate(current.user.status, current.user.tenant.status);
    const authenticatedUser = this.toAuthenticatedUser(current.user);
    const nextRefreshToken = this.tokens.issueRefreshToken();
    const nextSessionId = randomUUID();
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.create({
        data: {
          id: nextSessionId,
          tenantId: current.tenantId,
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
          expiresAt: new Date(now.getTime() + this.tokens.refreshTokenExpiresIn * 1000),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      const revoked = await tx.refreshSession.updateMany({
        where: { id: current.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokedReason: 'ROTATED',
          replacedById: nextSessionId,
          lastUsedAt: now,
        },
      });
      if (revoked.count !== 1) {
        await tx.refreshSession.delete({ where: { id: nextSessionId } });
        await tx.refreshSession.updateMany({
          where: { tenantId: current.tenantId, familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'TOKEN_REUSE_DETECTED' },
        });
        return false;
      }
      return true;
    });

    if (!updated) {
      throw this.invalidRefreshToken();
    }

    return this.buildResponse(authenticatedUser, nextRefreshToken);
  }

  async logout(refreshToken: string | undefined, metadata: SessionMetadata): Promise<void> {
    if (!refreshToken) return;

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
    });
    if (!session || session.revokedAt) return;

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: 'LOGOUT', lastUsedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          entityType: 'USER',
          entityId: session.userId,
          action: 'LOGOUT',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      }),
    ]);
  }

  async getAuthenticatedUser(tenantId: string, userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: loginUserInclude,
    });
    if (!user) throw this.invalidCredentials();
    this.assertUserCanAuthenticate(user.status, user.tenant.status);
    return this.toAuthenticatedUser(user);
  }

  private async createSession(
    user: AuthenticatedUser,
    metadata: SessionMetadata,
  ): Promise<IssuedAuthSession> {
    const refreshToken = this.tokens.issueRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + this.tokens.refreshTokenExpiresIn * 1000),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return this.buildResponse(user, refreshToken);
  }

  private buildResponse(user: AuthenticatedUser, refreshToken: string): IssuedAuthSession {
    return {
      accessToken: this.tokens.issueAccessToken({
        sub: user.id,
        tenantId: user.tenantId,
        customerCompanyId: user.customerCompanyId,
        roles: user.roles,
        userType: user.userType,
      }),
      accessTokenExpiresIn: this.tokens.accessTokenExpiresIn,
      refreshToken,
      refreshTokenExpiresIn: this.tokens.refreshTokenExpiresIn,
      user,
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    tenantId: string;
    customerCompanyId: string | null;
    email: string;
    displayName: string;
    userType: AuthenticatedUser['userType'];
    tenant: { code: string; name: string };
    userRoles: Array<{ role: { code: RoleCode; permissions: Array<{ permission: { code: string } }> } }>;
  }): AuthenticatedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      tenantCode: user.tenant.code,
      tenantName: user.tenant.name,
      ...(user.customerCompanyId ? { customerCompanyId: user.customerCompanyId } : {}),
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      roles: user.userRoles.map(({ role }) => role.code),
      permissions: [...new Set(user.userRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)))].sort(),
    };
  }

  private assertUserCanAuthenticate(userStatus: UserStatus, tenantStatus: TenantStatus): void {
    if (userStatus !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'USER_NOT_ACTIVE',
        message: 'User account is not active',
      });
    }
    if (tenantStatus !== TenantStatus.TRIAL && tenantStatus !== TenantStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'TENANT_NOT_ACTIVE',
        message: 'Tenant account is not active',
      });
    }
  }

  private revokeFamily(tenantId: string, familyId: string, reason: string): Promise<unknown> {
    return this.prisma.refreshSession.updateMany({
      where: { tenantId, familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Tenant code, email, or password is incorrect',
    });
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh session is invalid or expired',
    });
  }
}
