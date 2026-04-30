import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './scripts/playwright-global-setup.mjs',
  globalTeardown: './scripts/playwright-global-teardown.mjs',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'clerk setup',
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /core-agent-flow\.spec\.ts/,
      dependencies: ['clerk setup'],
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node ./scripts/with-test-env.mjs npm run dev:e2e -w apps/dashboard',
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node ./scripts/with-test-env.mjs npm run dev:e2e -w apps/gateway',
      url: 'http://127.0.0.1:8180/health/deep',
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
