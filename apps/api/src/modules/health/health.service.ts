import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@freight/types';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

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

      return {
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
        details: { dependency: 'postgresql' },
      });
    }
  }
}
