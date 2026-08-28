import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('returns API liveness status', () => {
    const service = new HealthService(prisma);

    expect(service.getHealth()).toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns readiness only when PostgreSQL responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService(prisma);

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns a stable dependency error when PostgreSQL is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const service = new HealthService(prisma);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getReadiness()).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
      },
    });
  });
});
