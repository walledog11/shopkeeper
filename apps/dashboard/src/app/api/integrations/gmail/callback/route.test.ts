import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const {
  mockCookieDelete,
  mockCookieGet,
  mockFetch,
} = vi.hoisted(() => ({
  mockCookieDelete: vi.fn(),
  mockCookieGet: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: mockCookieGet,
    delete: mockCookieDelete,
  })),
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { GET } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-client-secret');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /api/integrations/gmail/callback', () => {
  it('rejects state mismatch before token exchange', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'usr_oauth',
    });

    const res = await GET(new Request('http://localhost/api/integrations/gmail/callback?code=abc&state=other_state'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects user session mismatch', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'someone_else',
    });

    const res = await GET(new Request('http://localhost/api/integrations/gmail/callback?code=abc&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('persists gmail integration and removes any other email rows for the org', async () => {
    const staleEmail = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'support@old-domain.test',
        accessToken: 'postmark-key',
        metadata: { provider: 'postmark' },
      },
    });

    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'usr_oauth',
      gmail_oauth_return: '/dashboard/settings',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'gmail_access_token',
        refresh_token: 'gmail_refresh_token',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({ email: 'merchant@gmail.test' }));

    const res = await GET(new Request('http://localhost/api/integrations/gmail/callback?code=oauth_code&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/settings');

    const rows = await db.integration.findMany({
      where: { organizationId: org!.id, platform: ChannelType.email },
    });
    expect(rows).toHaveLength(1);
    const integration = rows[0];
    expect(integration.externalAccountId).toBe('merchant@gmail.test');
    expect(integration.accessToken).toBe('gmail_access_token');
    expect(integration.refreshToken).toBe('gmail_refresh_token');
    expect(integration.tokenExpiresAt).toBeInstanceOf(Date);
    expect(integration.metadata).toMatchObject({ provider: 'gmail' });
    expect(integration.id).not.toBe(staleEmail.id);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://oauth2.googleapis.com/token');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://openidconnect.googleapis.com/v1/userinfo');
  });

  it('redirects to access_denied when user cancels', async () => {
    const res = await GET(new Request('http://localhost/api/integrations/gmail/callback?error=access_denied'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=access_denied');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

function mockSavedCookies(values: Record<string, string>) {
  mockCookieGet.mockImplementation((name: string) => {
    const value = values[name];
    return value ? { value } : undefined;
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
