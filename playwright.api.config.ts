import { defineConfig } from '@playwright/test';

// The HTTP-only suite targets the running local API and never starts a browser or web server.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'booking-optimization-api.spec.ts',
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  outputDir: 'test-results/booking-api',
});
