import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import type { DocumentStorageService } from '../bookings/document-storage.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const checkReady = jest.fn();
  const storage = { checkReady } as unknown as DocumentStorageService;

  beforeEach(() => {
    queryRaw.mockReset();
    checkReady.mockReset();
    checkReady.mockResolvedValue(undefined);
  });

  it('returns API liveness status', () => {
    const service = new HealthService(prisma, storage);

    expect(service.getHealth()).toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns readiness only when PostgreSQL responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService(prisma, storage);

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns a stable dependency error when PostgreSQL is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const service = new HealthService(prisma, storage);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getReadiness()).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
      },
    });
  });

  it('returns the storage dependency error when object storage is unavailable', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    checkReady.mockRejectedValue(
      new ServiceUnavailableException({
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: '文件存储服务暂时不可用，请稍后重试或联系系统管理员。',
      }),
    );
    const service = new HealthService(prisma, storage);

    await expect(service.getReadiness()).rejects.toMatchObject({
      response: { code: 'DOCUMENT_STORAGE_UNAVAILABLE' },
    });
  });
});
