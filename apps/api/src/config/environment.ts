export interface ApiEnvironment {
  API_PORT: number;
  AUTH_ACCESS_TOKEN_SECRET: string;
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_REFRESH_TOKEN_SECRET: string;
  AUTH_REFRESH_TOKEN_TTL_SECONDS: number;
  DATABASE_URL: string;
  NODE_ENV: 'development' | 'test' | 'production';
  PASSWORD_HASH_PEPPER: string;
}

const allowedNodeEnvironments = new Set<ApiEnvironment['NODE_ENV']>([
  'development',
  'test',
  'production',
]);

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const databaseUrl = readRequiredString(config, 'DATABASE_URL');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must use the postgresql:// or postgres:// protocol');
  }

  const nodeEnvironment = readOptionalString(config, 'NODE_ENV') ?? 'development';
  if (!allowedNodeEnvironments.has(nodeEnvironment as ApiEnvironment['NODE_ENV'])) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const apiPort = parsePort(config.API_PORT, 4000);
  const accessTokenSecret = readSecret(config, 'AUTH_ACCESS_TOKEN_SECRET');
  const refreshTokenSecret = readSecret(config, 'AUTH_REFRESH_TOKEN_SECRET');
  const passwordHashPepper = readSecret(config, 'PASSWORD_HASH_PEPPER');
  const accessTokenTtlSeconds = parsePositiveInteger(
    config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    900,
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  );
  const refreshTokenTtlSeconds = parsePositiveInteger(
    config.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    604_800,
    'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  );

  return {
    ...config,
    API_PORT: apiPort,
    AUTH_ACCESS_TOKEN_SECRET: accessTokenSecret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: accessTokenTtlSeconds,
    AUTH_REFRESH_TOKEN_SECRET: refreshTokenSecret,
    AUTH_REFRESH_TOKEN_TTL_SECONDS: refreshTokenTtlSeconds,
    DATABASE_URL: databaseUrl,
    NODE_ENV: nodeEnvironment,
    PASSWORD_HASH_PEPPER: passwordHashPepper,
  };
}

function readSecret(config: Record<string, unknown>, key: string): string {
  const value = readRequiredString(config, key);
  if (value.length < 32) {
    throw new Error(`${key} must be at least 32 characters`);
  }

  return value;
}

function readRequiredString(config: Record<string, unknown>, key: string): string {
  const value = readOptionalString(config, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function readOptionalString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePort(value: unknown, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parsePositiveInteger(value: unknown, fallback: number, key: string): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}
