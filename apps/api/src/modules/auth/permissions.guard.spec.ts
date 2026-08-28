import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../../database/prisma.service.js';
import type { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { PermissionsGuard } from './permissions.guard.js';

const executionContext = {
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
} as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  it('allows a request when every required permission is granted', async () => {
    const guard = createGuard(['customer.read'], ['customer.read']);
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it('rejects a request when a required permission is missing', async () => {
    const guard = createGuard(['customer.manage'], ['customer.read']);
    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function createGuard(required: string[], granted: string[]): PermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const prisma = {
    permission: {
      findMany: jest.fn().mockResolvedValue(granted.map((code) => ({ code }))),
    },
  } as unknown as PrismaService;
  const requestContext = {
    requireAuthenticated: jest.fn().mockReturnValue({
      tenantId: 'tenant-1',
      userId: 'user-1',
      roles: [],
    }),
  } as unknown as RequestContextService;

  return new PermissionsGuard(reflector, prisma, requestContext);
}
