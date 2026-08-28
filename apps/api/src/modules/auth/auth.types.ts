import type { RoleCode, UserType } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  customerCompanyId?: string;
  email: string;
  displayName: string;
  userType: UserType;
  roles: RoleCode[];
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: AuthenticatedUser;
}

export interface IssuedAuthSession extends AuthResponse {
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}
