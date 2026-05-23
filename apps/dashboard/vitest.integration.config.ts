import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.unit.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
