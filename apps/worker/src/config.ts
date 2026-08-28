export interface WorkerConfig {
  concurrency: number;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    concurrency: Number(env.WORKER_CONCURRENCY ?? 5),
    redis: {
      host: env.REDIS_HOST ?? 'localhost',
      port: Number(env.REDIS_PORT ?? 6379),
      password: env.REDIS_PASSWORD || undefined,
    },
  };
}
