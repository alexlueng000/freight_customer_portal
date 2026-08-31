import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@freight/types';
import { PrismaService } from '../../database/prisma.service.js';
import { DocumentStorageService } from '../bookings/document-storage.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.storage.checkReady();

      return {
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
        details: { dependency: 'postgresql' },
      });
    }
  }
}
