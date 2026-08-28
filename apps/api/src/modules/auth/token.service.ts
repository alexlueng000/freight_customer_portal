import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleCode, UserType } from '@prisma/client';
import jsonwebtoken, { type JwtPayload } from 'jsonwebtoken';

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  tenantId: string;
  customerCompanyId?: string;
  roles: RoleCode[];
  userType: UserType;
  tokenType: 'access';
}

interface AccessTokenInput {
  sub: string;
  tenantId: string;
  customerCompanyId?: string;
  roles: RoleCode[];
  userType: UserType;
}

@Injectable()
export class TokenService {
  readonly accessTokenExpiresIn: number;
  readonly refreshTokenExpiresIn: number;
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;

  constructor(config: ConfigService) {
    this.accessTokenSecret = config.getOrThrow<string>('AUTH_ACCESS_TOKEN_SECRET');
    this.refreshTokenSecret = config.getOrThrow<string>('AUTH_REFRESH_TOKEN_SECRET');
    this.accessTokenExpiresIn = config.getOrThrow<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS');
    this.refreshTokenExpiresIn = config.getOrThrow<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS');
  }

  issueAccessToken(input: AccessTokenInput): string {
    return jsonwebtoken.sign({ ...input, tokenType: 'access' }, this.accessTokenSecret, {
      algorithm: 'HS256',
      audience: 'freight-customer-portal',
      expiresIn: this.accessTokenExpiresIn,
      issuer: 'freight-customer-portal-api',
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      const payload = jsonwebtoken.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
        audience: 'freight-customer-portal',
        issuer: 'freight-customer-portal-api',
      });

      if (
        typeof payload === 'string' ||
        payload.tokenType !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.tenantId !== 'string' ||
        !Array.isArray(payload.roles) ||
        !payload.roles.every((role) => Object.values(RoleCode).includes(role as RoleCode)) ||
        !Object.values(UserType).includes(payload.userType as UserType)
      ) {
        throw new Error('Invalid access token claims');
      }

      return payload as AccessTokenClaims;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Access token is invalid or expired',
      });
    }
  }

  issueRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshTokenSecret).update(token).digest('hex');
  }
}
