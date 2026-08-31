import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { NormalizedRateImport } from './rate-import-normalizer.js';

export const RATE_IMPORT_QUEUE = 'rate-imports';
export const RATE_IMPORT_JOB = 'process-rate-import';

export interface RateImportJobData {
  importJobId: string;
  tenantId: string;
  actorUserId: string;
  originalFileName: string;
  workbookBase64?: string;
  normalizedRates?: NormalizedRateImport[];
  totalRows?: number;
}

@Injectable()
export class RateImportQueueService implements OnModuleDestroy {
  private readonly queue = new Queue<RateImportJobData>(RATE_IMPORT_QUEUE, {
    connection: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  enqueue(data: RateImportJobData) {
    return this.queue.add(RATE_IMPORT_JOB, data, { jobId: data.importJobId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
