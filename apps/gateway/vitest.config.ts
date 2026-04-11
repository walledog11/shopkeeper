import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
  },
});
