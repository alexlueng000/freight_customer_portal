import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4000';
const webPort = process.env.E2E_WEB_PORT ?? '3000';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Authentication is intentionally throttled; keep shared demo-account suites serial.
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results/playwright',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `NODE_ENV=test API_PORT=${apiPort} pnpm --filter @freight/api start`,
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `API_INTERNAL_URL=${apiUrl} pnpm --filter @freight/web exec next dev -p ${webPort}`,
      url: `${webUrl}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
