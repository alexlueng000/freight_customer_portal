import { RoleCode } from '@prisma/client';
import { RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  it('isolates and enriches an authenticated request context', () => {
    const service = new RequestContextService();

    service.run({ requestId: 'request-1', roles: [] }, () => {
      service.setAuthenticatedContext({
        tenantId: 'tenant-1',
        userId: 'user-1',
        customerCompanyId: 'customer-1',
        roles: [RoleCode.CUSTOMER_USER],
      });

      expect(service.get()).toEqual({
        requestId: 'request-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        customerCompanyId: 'customer-1',
        roles: [RoleCode.CUSTOMER_USER],
      });
      expect(service.requireTenantId()).toBe('tenant-1');
    });

    expect(service.get()).toBeUndefined();
  });

  it('rejects tenant access before authentication populates the context', () => {
    const service = new RequestContextService();

    service.run({ requestId: 'request-2', roles: [] }, () => {
      expect(() => service.requireTenantId()).toThrow('Authenticated tenant context is required');
    });
  });
});
