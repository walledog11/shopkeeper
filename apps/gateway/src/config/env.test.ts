import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGatewayDashboardUrl, validateGatewayEnv } from './env.js';

function stubBaseGatewayEnv() {
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/shopkeeper?pgbouncer=true&connection_limit=1');
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379/0');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', '0'.repeat(64));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getGatewayDashboardUrl', () => {
  it('falls back to DASHBOARD_INTERNAL_URL outside production flows', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('DASHBOARD_URL', '');
    vi.stubEnv('DASHBOARD_INTERNAL_URL', 'http://localhost:3000');

    expect(getGatewayDashboardUrl()).toBe('http://localhost:3000');
  });
});

describe('validateGatewayEnv', () => {
  it('passes outside production with only DASHBOARD_INTERNAL_URL set', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('DASHBOARD_URL', '');
    vi.stubEnv('DASHBOARD_INTERNAL_URL', 'http://localhost:3000');

    expect(() => validateGatewayEnv()).not.toThrow();
  });

  it('requires DASHBOARD_URL in production even if DASHBOARD_INTERNAL_URL is set', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_URL', '');
    vi.stubEnv('DASHBOARD_INTERNAL_URL', 'http://localhost:3000');

    expect(() => validateGatewayEnv()).toThrow(/Missing required environment variable: DASHBOARD_URL/);
  });

  it('passes in production when DASHBOARD_URL is configured', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_URL', 'https://app.example.com');

    expect(() => validateGatewayEnv()).not.toThrow();
  });

  it('does not require Meta secrets for the v1 email and Shopify launch path', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_URL', 'https://app.example.com');
    vi.stubEnv('META_APP_SECRET', '');

    expect(() => validateGatewayEnv()).not.toThrow();
  });

  it('rejects whitespace-only DASHBOARD_URL in production', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_URL', '   ');

    expect(() => validateGatewayEnv()).toThrow(/Missing required environment variable: DASHBOARD_URL/);
  });

  it('rejects invalid dashboard URLs', () => {
    stubBaseGatewayEnv();
    vi.stubEnv('DASHBOARD_URL', '');
    vi.stubEnv('DASHBOARD_INTERNAL_URL', 'not-a-url');

    expect(() => validateGatewayEnv()).toThrow(/DASHBOARD_INTERNAL_URL must be a valid absolute URL/);
  });
});
