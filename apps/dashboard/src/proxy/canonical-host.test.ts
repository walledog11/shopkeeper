import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCanonicalHostRedirect } from './canonical-host';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCanonicalHostRedirect', () => {
  it('moves app surfaces off the marketing apex onto the APP_URL host', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/onboarding', '?step=shopify')).toBe(
      'https://app.useshopkeeper.com/onboarding?step=shopify',
    );
  });

  it('moves the OAuth start and return hops so the state cookies survive', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(
      getCanonicalHostRedirect('useshopkeeper.com', '/api/integrations/shopify/auth', '?shop=palette.myshopify.com'),
    ).toBe('https://app.useshopkeeper.com/api/integrations/shopify/auth?shop=palette.myshopify.com');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/dashboard/integrations/oauth/complete', '')).toBe(
      'https://app.useshopkeeper.com/dashboard/integrations/oauth/complete',
    );
  });

  it('moves auth entry points off the marketing apex so Clerk cookies survive', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/login', '')).toBe(
      'https://app.useshopkeeper.com/login',
    );
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/signup', '?redirect_url=%2Fonboarding')).toBe(
      'https://app.useshopkeeper.com/signup?redirect_url=%2Fonboarding',
    );
  });

  it('leaves requests already on the canonical host alone', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect('app.useshopkeeper.com', '/onboarding', '')).toBeNull();
  });

  it('leaves marketing pages on the apex', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/', '')).toBeNull();
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/privacy', '')).toBeNull();
  });

  it('leaves preview deployments and unrelated hosts alone', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect('dashboard-shopkeeper.vercel.app', '/onboarding', '')).toBeNull();
    expect(getCanonicalHostRedirect('shopkeeper-git-branch.vercel.app', '/dashboard', '')).toBeNull();
  });

  it('claims no siblings when the canonical host is itself an apex', () => {
    vi.stubEnv('APP_URL', 'https://useshopkeeper.com');
    expect(getCanonicalHostRedirect('somethingelse.com', '/dashboard', '')).toBeNull();
  });

  it('stays inert for local development and when APP_URL is unusable', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    expect(getCanonicalHostRedirect('localhost:3000', '/onboarding', '')).toBeNull();
    expect(getCanonicalHostRedirect('127.0.0.1:3000', '/onboarding', '')).toBeNull();

    vi.stubEnv('APP_URL', '');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/onboarding', '')).toBeNull();

    vi.stubEnv('APP_URL', 'not-a-url');
    expect(getCanonicalHostRedirect('useshopkeeper.com', '/onboarding', '')).toBeNull();
  });

  it('needs a host header to act on', () => {
    vi.stubEnv('APP_URL', 'https://app.useshopkeeper.com');
    expect(getCanonicalHostRedirect(null, '/onboarding', '')).toBeNull();
  });
});
