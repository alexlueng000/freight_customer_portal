import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { RequestContextService } from '../../shared/request-context/request-context.service.js';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';
import { RateImportsService } from './rate-imports.service.js';

describe('built-in port mappings', () => {
  it('shows actual import and search aliases separately', async () => {
    const module = await Test.createTestingModule({
      controllers: [RatesController],
      providers: [{ provide: RatesService, useValue: {} }, { provide: RateImportsService, useValue: {} }],
    }).compile();
    const { items } = module.get(RatesController).portMappings();
    expect(items).toHaveLength(19);
    expect(new Set(items.map((item) => item.code)).size).toBe(items.length);
    const shenzhen = items.find((item) => item.code === 'CNSZX');
    expect(shenzhen?.importAliases).toContain('盐田');
    expect(shenzhen?.searchAliases).not.toContain('盐田');
    expect(items.find((item) => item.code === 'USLAX')?.chineseName).toBe('洛杉矶');
    await module.close();
  });

  it('enforces the endpoint permission in the caller tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const guard = new PermissionsGuard(new Reflector(),
      { permission: { findMany } } as unknown as PrismaService,
      { requireAuthenticated: () => ({ tenantId: 'tenant-a', userId: 'user-a' }) } as RequestContextService);
    const context = {
      getHandler: () => RatesController.prototype.portMappings,
      getClass: () => RatesController,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      code: { in: ['rate.read'] },
      roles: { some: { role: { tenantId: 'tenant-a', userRoles: { some: { userId: 'user-a' } } } } },
    } }));
    findMany.mockResolvedValue([{ code: 'rate.read' }]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
