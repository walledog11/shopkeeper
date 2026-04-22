import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDashboardAppUrl, validateDashboardEnv } from './env';

function stubBaseDashboardEnv() {
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/clerk?pgbouncer=true&connection_limit=1');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_clerk');
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateDashboardEnv', () => {
  it('passes with the base server env outside production', () => {
    stubBaseDashboardEnv();

    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it('requires paired Upstash env vars', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    expect(() => validateDashboardEnv()).toThrow(/UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN/);
  });

  it('requires APP_URL and the Clerk publishable key in production', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

    expect(() => validateDashboardEnv()).toThrow(
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, APP_URL/
    );
  });

  it('rejects mismatched app URLs in production', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_clerk');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

    expect(() => validateDashboardEnv()).toThrow(/APP_URL and NEXT_PUBLIC_APP_URL must match/);
  });

  it('rejects invalid app URLs in production', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_clerk');
    vi.stubEnv('APP_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

    expect(() => validateDashboardEnv()).toThrow(/APP_URL must be a valid absolute URL/);
  });

  it('passes in production when the public app URLs match', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_clerk');
    vi.stubEnv('APP_URL', 'https://app.example.com/');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it('passes in production without NEXT_PUBLIC_APP_URL when APP_URL is set', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_clerk');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

    expect(() => validateDashboardEnv()).not.toThrow();
  });

  it('rejects whitespace-only production env values', () => {
    stubBaseDashboardEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '   ');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'upstash-token');

    expect(() => validateDashboardEnv()).toThrow(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  });
});

describe('getDashboardAppUrl', () => {
  it('prefers APP_URL when it is set', () => {
    vi.stubEnv('APP_URL', 'https://app.example.com/');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.com');

    expect(getDashboardAppUrl()).toBe('https://app.example.com');
  });

  it('falls back to localhost outside production when no app URL env is set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

    expect(getDashboardAppUrl()).toBe('http://localhost:3000');
  });
});
