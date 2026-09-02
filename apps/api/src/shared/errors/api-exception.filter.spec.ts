import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { RequestContextService } from '../request-context/request-context.service.js';

describe('ApiExceptionFilter security audit', () => {
  const context = new RequestContextService();
  const create = jest
    .fn<Promise<{ id: string }>, [{ data: Record<string, unknown> }]>()
    .mockResolvedValue({ id: 'audit-1' });
  const filter = new ApiExceptionFilter(context, { auditLog: { create } } as never);

  beforeEach(() => create.mockClear());

  it('records authenticated sensitive-resource probes against the requester tenant', async () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/invoices/foreign-id',
      path: '/api/v1/invoices/foreign-id',
      params: { id: 'foreign-id' },
      ip: '127.0.0.1',
      header: (name: string) => (name === 'user-agent' ? 'jest' : undefined),
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    };

    await context.run(
      { requestId: 'req-security', tenantId: 'requester-tenant', userId: 'requester', roles: [] },
      () =>
        filter.catch(
          new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' }),
          host as never,
        ),
    );

    const audit = create.mock.calls[0]?.[0].data;
    expect(audit?.tenantId).toBe('requester-tenant');
    expect(audit?.actorUserId).toBe('requester');
    expect(audit?.entityType).toBe('Invoice');
    expect(audit?.entityId).toBe('foreign-id');
    expect(audit?.action).toBe('ACCESS_DENIED');
    expect(audit?.afterData).toEqual(
      expect.objectContaining({ code: 'INVOICE_NOT_FOUND', requestId: 'req-security' }),
    );
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('does not audit unauthenticated not-found responses', async () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/v1/invoices/foreign-id',
          path: '/api/v1/invoices/foreign-id',
          params: { id: 'foreign-id' },
          header: () => undefined,
        }),
        getResponse: () => response,
      }),
    };
    await context.run({ requestId: 'req-public', roles: [] }, () =>
      filter.catch(new NotFoundException(), host as never),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('groups validation messages by field for form clients', async () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'PATCH',
          originalUrl: '/api/v1/customers/id',
          path: '/api/v1/customers/id',
          params: {},
          header: () => undefined,
        }),
        getResponse: () => response,
      }),
    };
    await context.run({ requestId: 'req-validation', roles: [] }, () =>
      filter.catch(
        new BadRequestException({
          message: [
            'name must be longer than or equal to 1 characters',
            'countryCode must match /^[A-Z]{2}$/ regular expression',
          ],
        }),
        host as never,
      ),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        // Jest asymmetric matchers are intentionally dynamic values.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        details: expect.objectContaining({
          fieldErrors: {
            name: ['name must be longer than or equal to 1 characters'],
            countryCode: ['countryCode must match /^[A-Z]{2}$/ regular expression'],
          },
        }),
      }),
    );
  });
});
