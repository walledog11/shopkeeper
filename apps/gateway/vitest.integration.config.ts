import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    setupFiles: ['../../packages/shared/src/test-setup.ts', './src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.integration.test.ts'],
  },
});
