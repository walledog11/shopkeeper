import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieValues, mockDelete, mockGet, mockSet } = vi.hoisted(() => {
  const cookieValues = new Map<string, string>();
  return {
    cookieValues,
    mockDelete: vi.fn((name: string) => cookieValues.delete(name)),
    mockGet: vi.fn((name: string) => {
      const value = cookieValues.get(name);
      return value ? { value } : undefined;
    }),
    mockSet: vi.fn((name: string, value: string) => cookieValues.set(name, value)),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ delete: mockDelete, get: mockGet, set: mockSet })),
}));
vi.mock('@/lib/server/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { auth } from '@clerk/nextjs/server';
import {
  createOAuthSessionCookies,
  validateOAuthCallbackSession,
} from './oauth-session';

beforeEach(() => {
  cookieValues.clear();
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    userId: 'user_1',
    orgId: 'org_1',
    orgRole: 'org:admin',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

describe('OAuth attempt sessions', () => {
  it('keeps concurrent same-provider attempts independent when completed in reverse order', async () => {
    const config = { provider: 'shopify' } as const;
    const first = await createOAuthSessionCookies(
      new Request('https://dashboard.test/auth?mode=popup&returnTo=/first'),
      config,
      { userId: 'user_1', orgId: 'org_1' },
      { shop: 'first.myshopify.com' },
    );
    const second = await createOAuthSessionCookies(
      new Request('https://dashboard.test/auth?mode=redirect&returnTo=/second'),
      config,
      { userId: 'user_1', orgId: 'org_1' },
      { shop: 'second.myshopify.com' },
    );

    expect(cookieValues.size).toBe(2);

    const completedSecond = await validateOAuthCallbackSession({
      extraCookieKeys: ['shop'],
      logPrefix: 'test',
      provider: 'shopify',
      state: second.state,
    });
    expect(completedSecond).toEqual({
      ok: true,
      session: {
        attemptId: second.state,
        clerkOrgId: 'org_1',
        returnTo: '/second',
        mode: 'redirect',
        extra: { shop: 'second.myshopify.com' },
      },
    });
    expect(cookieValues.size).toBe(1);

    const completedFirst = await validateOAuthCallbackSession({
      extraCookieKeys: ['shop'],
      logPrefix: 'test',
      provider: 'shopify',
      state: first.state,
    });
    expect(completedFirst).toEqual({
      ok: true,
      session: {
        attemptId: first.state,
        clerkOrgId: 'org_1',
        returnTo: '/first',
        mode: 'popup',
        extra: { shop: 'first.myshopify.com' },
      },
    });
    expect(cookieValues.size).toBe(0);
  });

  it('rejects malformed state without using it as a cookie name', async () => {
    const result = await validateOAuthCallbackSession({
      logPrefix: 'test',
      provider: 'gmail',
      state: '../cookie',
    });

    expect(result.ok).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each([
    ['another organization', { userId: 'user_1', orgId: 'org_2', orgRole: 'org:admin' }],
    ['a non-admin role', { userId: 'user_1', orgId: 'org_1', orgRole: 'org:member' }],
  ])('rejects a valid attempt completed from %s', async (_label, identity) => {
    const attempt = await createOAuthSessionCookies(
      new Request('https://dashboard.test/auth'),
      { provider: 'gmail' },
      { userId: 'user_1', orgId: 'org_1' },
    );
    vi.mocked(auth).mockResolvedValue(
      identity as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    );

    const result = await validateOAuthCallbackSession({
      logPrefix: 'test',
      provider: 'gmail',
      state: attempt.state,
    });

    expect(result.ok).toBe(false);
  });
});
