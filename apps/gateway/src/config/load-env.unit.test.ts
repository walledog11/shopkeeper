import { afterEach, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import { loadGatewayEnv } from './load-env.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('preserves the shared dev environment instead of reloading conflicting gateway values', () => {
  vi.spyOn(dotenv, 'config').mockImplementation(options => {
    if (options?.override) process.env.DASHBOARD_URL = 'https://production.example.com';
    return { parsed: {} };
  });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SHOPKEEPER_LOCAL_DEV', 'true');
  vi.stubEnv('DASHBOARD_URL', 'http://localhost:3000');
  loadGatewayEnv();
  expect(process.env.DASHBOARD_URL).toBe('http://localhost:3000');
});
