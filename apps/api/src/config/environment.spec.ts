import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('normalizes a valid API environment', () => {
    expect(
      validateEnvironment({
        API_PORT: '4100',
        AUTH_ACCESS_TOKEN_SECRET: 'access-secret-with-at-least-32-characters',
        AUTH_REFRESH_TOKEN_SECRET: 'refresh-secret-with-at-least-32-characters',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
        NODE_ENV: 'test',
        PASSWORD_HASH_PEPPER: 'password-pepper-with-at-least-32-characters',
        RATE_IMPORT_PREVIEW_TTL_SECONDS: '1200',
      }),
    ).toMatchObject({
      API_PORT: 4100,
      NODE_ENV: 'test',
      RATE_IMPORT_PREVIEW_TTL_SECONDS: 1200,
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL is required');
  });

  it('rejects an invalid API port', () => {
    expect(() =>
      validateEnvironment({
        AUTH_ACCESS_TOKEN_SECRET: 'access-secret-with-at-least-32-characters',
        AUTH_REFRESH_TOKEN_SECRET: 'refresh-secret-with-at-least-32-characters',
        DATABASE_URL: 'postgresql://localhost/database',
        PASSWORD_HASH_PEPPER: 'password-pepper-with-at-least-32-characters',
        API_PORT: '70000',
      }),
    ).toThrow('API_PORT must be an integer between 1 and 65535');
  });

  it('rejects short authentication secrets', () => {
    expect(() =>
      validateEnvironment({
        AUTH_ACCESS_TOKEN_SECRET: 'short',
        AUTH_REFRESH_TOKEN_SECRET: 'refresh-secret-with-at-least-32-characters',
        DATABASE_URL: 'postgresql://localhost/database',
        PASSWORD_HASH_PEPPER: 'password-pepper-with-at-least-32-characters',
      }),
    ).toThrow('AUTH_ACCESS_TOKEN_SECRET must be at least 32 characters');
  });

  it('rejects a non-positive rate import preview TTL', () => {
    expect(() => validateEnvironment({
      AUTH_ACCESS_TOKEN_SECRET: 'access-secret-with-at-least-32-characters',
      AUTH_REFRESH_TOKEN_SECRET: 'refresh-secret-with-at-least-32-characters',
      DATABASE_URL: 'postgresql://localhost/database',
      PASSWORD_HASH_PEPPER: 'password-pepper-with-at-least-32-characters',
      RATE_IMPORT_PREVIEW_TTL_SECONDS: '0',
    })).toThrow('RATE_IMPORT_PREVIEW_TTL_SECONDS must be a positive integer');
  });
});
