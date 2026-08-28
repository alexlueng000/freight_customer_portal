import { QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerConfig } from './config.js';

const config = loadWorkerConfig();
const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
});

const queueEvents = new QueueEvents('freight-default', { connection });

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Worker job failed',
      queue: 'freight-default',
      jobId,
      failedReason,
    }),
  );
});

async function shutdown(signal: NodeJS.Signals) {
  console.info(JSON.stringify({ level: 'info', message: 'Worker shutting down', signal }));
  await queueEvents.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', (signal) => void shutdown(signal));
process.on('SIGTERM', (signal) => void shutdown(signal));

console.info(
  JSON.stringify({
    level: 'info',
    message: 'Worker started',
    queue: 'freight-default',
    concurrency: config.concurrency,
  }),
);
