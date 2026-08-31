import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import type { RateImportPreviewConfig } from './rate-import-normalizer.js';
import type { previewRateImportWorkbook } from './rate-import-normalizer.js';

export interface StoredRateImportPreview {
  version: 1;
  tenantId: string;
  userId: string;
  originalFileName: string;
  workbookBase64: string;
  configuration: RateImportPreviewConfig;
  preview: Awaited<ReturnType<typeof previewRateImportWorkbook>>;
  createdAt: string;
  expiresAt: string;
}

@Injectable()
export class RateImportPreviewStoreService implements OnModuleDestroy {
  private readonly redis: Redis;
  readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.ttlSeconds = Number(config.get('RATE_IMPORT_PREVIEW_TTL_SECONDS') ?? 1800);
    this.redis = new Redis({
      host: config.get('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: config.get('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async save(data: Omit<StoredRateImportPreview, 'version' | 'createdAt' | 'expiresAt'>) {
    const previewToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const payload: StoredRateImportPreview = {
      ...data,
      version: 1,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    try {
      await this.redis.set(this.key(previewToken), JSON.stringify(payload), 'EX', this.ttlSeconds, 'NX');
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_IMPORT_PREVIEW_STORE_UNAVAILABLE',
        message: '暂时无法保存预览，请稍后重试。',
      });
    }
    return { previewToken, expiresAt: payload.expiresAt };
  }

  async get(previewToken: string, tenantId: string, userId: string) {
    let serialized: string | null;
    try {
      serialized = await this.redis.get(this.key(previewToken));
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_IMPORT_PREVIEW_STORE_UNAVAILABLE',
        message: '暂时无法读取预览，请稍后重试。',
      });
    }
    if (!serialized) return undefined;
    const payload = JSON.parse(serialized) as StoredRateImportPreview;
    if (payload.version !== 1 || payload.tenantId !== tenantId || payload.userId !== userId) return undefined;
    return payload;
  }

  async claim(previewToken: string, tenantId: string, userId: string, proposedImportJobId: string) {
    const payload = await this.get(previewToken, tenantId, userId);
    if (!payload) return { status: 'NOT_FOUND' as const };
    const remainingSeconds = Math.max(1, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000));
    try {
      const claimed = await this.redis.set(this.claimKey(previewToken), proposedImportJobId, 'EX', remainingSeconds, 'NX');
      if (claimed === 'OK') return { status: 'CLAIMED' as const, payload, importJobId: proposedImportJobId };
      const existingImportJobId = await this.redis.get(this.claimKey(previewToken));
      return existingImportJobId
        ? { status: 'ALREADY_CLAIMED' as const, payload, importJobId: existingImportJobId }
        : { status: 'NOT_FOUND' as const };
    } catch {
      throw new ServiceUnavailableException({ code: 'RATE_IMPORT_PREVIEW_STORE_UNAVAILABLE', message: '暂时无法确认预览，请稍后重试。' });
    }
  }

  private key(token: string) {
    const digest = createHash('sha256').update(token).digest('hex');
    return `rate-import-preview:v1:${digest}`;
  }

  private claimKey(token: string) {
    const digest = createHash('sha256').update(token).digest('hex');
    return `rate-import-preview-claim:v1:${digest}`;
  }

  async onModuleDestroy() {
    if (this.redis.status !== 'wait') await this.redis.quit();
    else this.redis.disconnect();
  }
}
