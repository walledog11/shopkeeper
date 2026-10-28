import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { ForbiddenError } from '@/lib/api/errors';
import { ADMIN_REQUIRED_MESSAGE, assertOrgAdmin, isOrgAdmin } from './permissions';

function setRole(orgRole: string | null) {
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_test',
    orgId: 'org_clerk_test',
    orgRole,
  } as Awaited<ReturnType<typeof auth>>);
}

beforeEach(() => {
  vi.stubEnv('E2E_AUTH_BYPASS', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('isOrgAdmin', () => {
  it('accepts the Clerk admin role', async () => {
    setRole('org:admin');
    await expect(isOrgAdmin()).resolves.toBe(true);
  });

  it('rejects a member', async () => {
    setRole('org:member');
    await expect(isOrgAdmin()).resolves.toBe(false);
  });

  it('rejects a session with no role rather than defaulting open', async () => {
    setRole(null);
    await expect(isOrgAdmin()).resolves.toBe(false);
  });

  it('rejects an unrecognized custom role', async () => {
    setRole('org:billing_manager');
    await expect(isOrgAdmin()).resolves.toBe(false);
  });

  it('treats the E2E bypass identity as the workspace admin', async () => {
    vi.stubEnv('E2E_AUTH_BYPASS', 'true');
    setRole('org:member');
    await expect(isOrgAdmin()).resolves.toBe(true);
    // The bypass answers before Clerk is consulted at all.
    expect(auth).not.toHaveBeenCalled();
  });
});

describe('assertOrgAdmin', () => {
  it('passes for an admin', async () => {
    setRole('org:admin');
    await expect(assertOrgAdmin()).resolves.toBeUndefined();
  });

  it('throws a 403 ForbiddenError for a member', async () => {
    setRole('org:member');
    await expect(assertOrgAdmin()).rejects.toThrowError(ForbiddenError);
    await expect(assertOrgAdmin()).rejects.toThrowError(ADMIN_REQUIRED_MESSAGE);
  });
});
