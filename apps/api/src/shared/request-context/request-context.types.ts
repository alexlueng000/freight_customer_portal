import type { RoleCode } from '@prisma/client';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  customerCompanyId?: string;
  roles: RoleCode[];
}

export interface AuthenticatedRequestContext {
  tenantId: string;
  userId: string;
  customerCompanyId?: string;
  roles: RoleCode[];
}
