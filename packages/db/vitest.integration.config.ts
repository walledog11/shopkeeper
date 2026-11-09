import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['../shared/src/test-setup.ts'],
    include: ['**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
