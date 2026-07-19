import { afterEach, describe, expect, it, vi } from 'vitest';

const { logger } = vi.hoisted(() => ({
  logger: { warn: vi.fn() },
}));

vi.mock('../logger.js', () => ({ default: logger }));

import { resolveClerkUserApprover } from './clerk-approver.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  logger.warn.mockReset();
});

describe('resolveClerkUserApprover', () => {
  it('returns undefined without a user id', async () => {
    await expect(resolveClerkUserApprover(null)).resolves.toBeUndefined();
  });

  it('returns an id-only identity when Clerk is not configured', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '');

    await expect(resolveClerkUserApprover('user-1')).resolves.toEqual({
      clerkUserId: 'user-1',
      displayName: null,
    });
  });

  it.each([
    [{ first_name: 'Alex', last_name: 'Rivera' }, 'Alex Rivera'],
    [{ username: 'alexr' }, 'alexr'],
    [{ email_addresses: [{ email_address: 'alex@example.com' }] }, 'alex@example.com'],
  ])('uses the best available Clerk display name', async (payload, displayName) => {
    vi.stubEnv('CLERK_SECRET_KEY', 'secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));

    await expect(resolveClerkUserApprover('user/a')).resolves.toEqual({
      clerkUserId: 'user/a',
      displayName,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user%2Fa',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('degrades safely on Clerk HTTP and network failures', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'secret');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveClerkUserApprover('user-1')).resolves.toEqual({
      clerkUserId: 'user-1',
      displayName: null,
    });
    await expect(resolveClerkUserApprover('user-2')).resolves.toEqual({
      clerkUserId: 'user-2',
      displayName: null,
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
