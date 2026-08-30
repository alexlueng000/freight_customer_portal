import { PrismaClient } from '@prisma/client';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerConfig } from './config.js';
import {
  processRateImport,
  RATE_IMPORT_JOB,
  RATE_IMPORT_QUEUE,
  type RateImportJobData,
} from './rate-import.processor.js';
import { expireDueQuotes } from './quote-expiry.processor.js';
import {
  processQuotePdf,
  QUOTE_PDF_JOB,
  QUOTE_PDF_QUEUE,
  type QuotePdfJobData,
} from './quote-pdf.processor.js';
import {
  EMAIL_NOTIFICATION_QUEUE,
  processEmailNotification,
  SEND_EMAIL_NOTIFICATION_JOB,
  type EmailNotificationJobData,
} from './email-notification.processor.js';

const config = loadWorkerConfig();
const connectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
};
const eventConnection = new Redis(connectionOptions);
const workerConnection = new Redis(connectionOptions);
const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials:
    config.s3.accessKeyId && config.s3.secretAccessKey
      ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
      : undefined,
});
const queueEvents = new QueueEvents(RATE_IMPORT_QUEUE, { connection: eventConnection });
const worker = new Worker<RateImportJobData>(
  RATE_IMPORT_QUEUE,
  async (job) => {
    if (job.name !== RATE_IMPORT_JOB) throw new Error(`Unsupported job: ${job.name}`);
    return processRateImport(prisma, job.data);
  },
  { connection: workerConnection, concurrency: config.concurrency },
);
const quotePdfEvents = new QueueEvents(QUOTE_PDF_QUEUE, {
  connection: new Redis(connectionOptions),
});
const quotePdfWorker = new Worker<QuotePdfJobData>(
  QUOTE_PDF_QUEUE,
  async (job) => {
    if (job.name !== QUOTE_PDF_JOB) throw new Error(`Unsupported job: ${job.name}`);
    return processQuotePdf(s3, config.s3.bucket, job.data);
  },
  { connection: new Redis(connectionOptions), concurrency: config.concurrency },
);
const emailEvents = new QueueEvents(EMAIL_NOTIFICATION_QUEUE, {
  connection: new Redis(connectionOptions),
});
const emailWorker = new Worker<EmailNotificationJobData>(
  EMAIL_NOTIFICATION_QUEUE,
  async (job) => {
    if (job.name !== SEND_EMAIL_NOTIFICATION_JOB) throw new Error(`Unsupported job: ${job.name}`);
    return processEmailNotification(prisma, {
      send(message) {
        if (config.emailDeliveryMode !== 'log')
          throw new Error(`Unsupported EMAIL_DELIVERY_MODE: ${config.emailDeliveryMode}`);
        console.info(JSON.stringify({ level: 'info', message: 'Email delivery (log mode)', ...message }));
        return Promise.resolve();
      },
    }, job.data);
  },
  { connection: new Redis(connectionOptions), concurrency: config.concurrency },
);

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
  }
}
await ensureBucket();
const expiryTimer = setInterval(() => {
  void expireDueQuotes(prisma)
    .then((count) => {
      if (count > 0)
        console.info(JSON.stringify({ level: 'info', message: 'Expired due quotes', count }));
    })
    .catch((error: unknown) =>
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Quote expiry scan failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
}, config.quoteExpiryIntervalMs);
expiryTimer.unref();

queueEvents.on('failed', ({ jobId, failedReason }) =>
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Worker job failed',
      queue: RATE_IMPORT_QUEUE,
      jobId,
      failedReason,
    }),
  ),
);
worker.on('completed', (job) =>
  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Worker job completed',
      queue: RATE_IMPORT_QUEUE,
      jobId: job.id,
    }),
  ),
);
quotePdfWorker.on('completed', (job) =>
  console.info(
    JSON.stringify({
      level: 'info',
      message: 'Worker job completed',
      queue: QUOTE_PDF_QUEUE,
      jobId: job.id,
    }),
  ),
);

async function shutdown(signal: NodeJS.Signals) {
  console.info(JSON.stringify({ level: 'info', message: 'Worker shutting down', signal }));
  clearInterval(expiryTimer);
  await worker.close();
  await quotePdfWorker.close();
  await emailWorker.close();
  await queueEvents.close();
  await quotePdfEvents.close();
  await emailEvents.close();
  await prisma.$disconnect();
  s3.destroy();
  await Promise.all([eventConnection.quit(), workerConnection.quit()]);
  process.exit(0);
}
process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));
console.info(
  JSON.stringify({
    level: 'info',
    message: 'Worker started',
    queue: RATE_IMPORT_QUEUE,
    concurrency: config.concurrency,
  }),
);
