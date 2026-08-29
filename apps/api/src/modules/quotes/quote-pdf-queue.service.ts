import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';

export const QUOTE_PDF_QUEUE = 'quote-pdfs';
export const QUOTE_PDF_JOB = 'generate-quote-pdf';

export interface QuotePdfJobData {
  tenantId: string;
  quoteId: string;
  version: number;
  objectKey: string;
  quote: {
    quoteNo: string;
    status: string;
    polCode: string;
    podCode: string;
    carrierCode: string | null;
    etd: string | null;
    validUntil: string;
    currency: string;
    totalAmount: string;
    version: number;
    customerName: string;
    items: Array<{
      chargeCode: string;
      chargeName: string;
      containerType: string | null;
      quantity: string;
      unitPrice: string;
      amount: string;
      currency: string;
    }>;
  };
}

@Injectable()
export class QuotePdfQueueService implements OnModuleDestroy {
  private readonly connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
  private readonly queue = new Queue<QuotePdfJobData>(QUOTE_PDF_QUEUE, {
    connection: this.connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
  private readonly events = new QueueEvents(QUOTE_PDF_QUEUE, { connection: this.connection });
  private readonly bucket = process.env.S3_BUCKET ?? 'freight-documents';
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  async getOrGenerate(data: Omit<QuotePdfJobData, 'objectKey'>): Promise<Buffer> {
    const objectKey = `tenants/${data.tenantId}/quotes/${data.quoteId}/v${data.version}.pdf`;
    if (!(await this.exists(objectKey))) {
      const jobId = `${data.tenantId}-${data.quoteId}-v${data.version}`;
      let existing = await this.queue.getJob(jobId);
      if (existing && ['completed', 'failed'].includes(await existing.getState())) {
        await existing.remove();
        existing = undefined;
      }
      const job =
        existing ?? (await this.queue.add(QUOTE_PDF_JOB, { ...data, objectKey }, { jobId }));
      try {
        await job.waitUntilFinished(this.events, 30_000);
      } catch {
        throw new ServiceUnavailableException({
          code: 'QUOTE_PDF_GENERATION_FAILED',
          message: 'Quote PDF is not available yet; please retry shortly',
        });
      }
    }
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body)
      throw new ServiceUnavailableException({
        code: 'QUOTE_PDF_NOT_AVAILABLE',
        message: 'Quote PDF is not available',
      });
    return Buffer.from(await response.Body.transformToByteArray());
  }

  private async exists(objectKey: string) {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.queue.close(), this.events.close()]);
    this.s3.destroy();
  }
}
