import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/**/test-fixtures/**',
        'src/test-setup.ts',
        // Hand-run diagnostics and canaries, entered by tsx and imported by
        // nothing the service runs. Counting them measures how many one-off
        // scripts exist, not how well the gateway is tested.
        'src/scripts/**',
      ],
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      thresholds: {
        statements: 83,
        branches: 75,
        functions: 84.3,
        lines: 84.8,
      },
    },
  },
});
