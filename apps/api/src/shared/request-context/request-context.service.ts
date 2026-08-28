import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequestContext, RequestContext } from './request-context.types.js';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.get()?.requestId;
  }

  setAuthenticatedContext(context: AuthenticatedRequestContext): void {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error('Request context is not initialized');
    }

    store.tenantId = context.tenantId;
    store.userId = context.userId;
    store.customerCompanyId = context.customerCompanyId;
    store.roles = [...context.roles];
  }

  requireTenantId(): string {
    const tenantId = this.get()?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'Authenticated tenant context is required',
      });
    }

    return tenantId;
  }

  requireAuthenticated(): AuthenticatedRequestContext {
    const context = this.get();
    if (!context?.tenantId || !context.userId) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    return {
      tenantId: context.tenantId,
      userId: context.userId,
      customerCompanyId: context.customerCompanyId,
      roles: [...context.roles],
    };
  }
}
