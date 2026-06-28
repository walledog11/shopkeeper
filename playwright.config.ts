import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: /core-agent-flow\.spec\.ts/,
  globalSetup: './scripts/playwright-global-setup.mjs',
  globalTeardown: './scripts/playwright-global-teardown.mjs',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  // Smoke specs share one seeded auth-bypass organization. Serial workers keep
  // onboarding mutation/restore isolated from ticket and billing workflows.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node ./scripts/with-test-env.mjs npm run serve:e2e -w apps/dashboard',
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'node ./scripts/with-test-env.mjs npm run dev:e2e -w apps/gateway',
      url: 'http://127.0.0.1:8180/health/deep',
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
