export interface WorkerConfig {
  concurrency: number;
  databaseUrl: string;
  quoteExpiryIntervalMs: number;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return {
    concurrency: Number(env.WORKER_CONCURRENCY ?? 5),
    databaseUrl,
    quoteExpiryIntervalMs: Number(env.QUOTE_EXPIRY_INTERVAL_MS ?? 60_000),
    redis: {
      host: env.REDIS_HOST ?? 'localhost',
      port: Number(env.REDIS_PORT ?? 6379),
      password: env.REDIS_PASSWORD || undefined,
    },
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east-1',
      bucket: env.S3_BUCKET ?? 'freight-documents',
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    },
  };
}
