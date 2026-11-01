import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  outputDir: 'node_modules/.cache/playwright',
  fullyParallel: true,
  workers: '100%',
  forbidOnly: true,
  retries: 0,
  reporter: 'line',
  timeout: 30_000,
  expect: { timeout: 15_000 },
  projects: [
    { name: 'logic', testMatch: /\.test\.ts$/ },
    {
      name: 'browser',
      testMatch: /\.spec\.ts$/,
      use: { browserName: 'chromium' },
    },
  ],
});
