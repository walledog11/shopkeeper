import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockCookieDelete,
  mockCookieGet,
  mockFetch,
  mockLogger,
} = vi.hoisted(() => ({
  mockCookieDelete: vi.fn(),
  mockCookieGet: vi.fn(),
  mockFetch: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
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

vi.mock('@/lib/server/logger', () => ({
  default: mockLogger,
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'ms-client-id');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'ms-client-secret');
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

describe('POST /api/integrations/outlook/callback', () => {
  it('rejects state mismatch before token exchange', async () => {
    mockSavedCookies({
      outlook_oauth_state: 'state_123',
      outlook_oauth_org: org!.clerkOrgId,
      outlook_oauth_user: 'usr_oauth',
    });

    const res = await POST(new Request('http://localhost/api/integrations/outlook/callback?code=abc&state=other_state'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith('[Outlook OAuth] State mismatch , possible CSRF attempt');
  });

  it('rejects user session mismatch', async () => {
    mockSavedCookies({
      outlook_oauth_state: 'state_123',
      outlook_oauth_org: org!.clerkOrgId,
      outlook_oauth_user: 'someone_else',
    });

    const res = await POST(new Request('http://localhost/api/integrations/outlook/callback?code=abc&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { savedUserId: 'someone_else', currentUserId: 'usr_oauth' },
      '[Outlook OAuth] User session mismatch , possible CSRF attempt',
    );
  });

  it('persists outlook integration and removes any other email rows for the org', async () => {
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
      outlook_oauth_state: 'state_123',
      outlook_oauth_org: org!.clerkOrgId,
      outlook_oauth_user: 'usr_oauth',
      outlook_oauth_return: '/dashboard/settings',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'outlook_access_token',
        refresh_token: 'outlook_refresh_token',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({ mail: 'merchant@outlook.test' }));

    const res = await POST(new Request('http://localhost/api/integrations/outlook/callback?code=oauth_code&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/settings');

    const rows = await db.integration.findMany({
      where: { organizationId: org!.id, platform: ChannelType.email },
    });
    expect(rows).toHaveLength(1);
    const integration = rows[0];
    expect(integration.externalAccountId).toBe('merchant@outlook.test');
    expect(integration.accessToken).toBe('outlook_access_token');
    expect(integration.refreshToken).toBe('outlook_refresh_token');
    expect(integration.tokenExpiresAt).toBeInstanceOf(Date);
    expect(integration.metadata).toMatchObject({ provider: 'outlook' });
    expect(integration.id).not.toBe(staleEmail.id);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://graph.microsoft.com/v1.0/me');
  });

  it('falls back to userPrincipalName when mail is null', async () => {
    mockSavedCookies({
      outlook_oauth_state: 'state_123',
      outlook_oauth_org: org!.clerkOrgId,
      outlook_oauth_user: 'usr_oauth',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'outlook_access_token',
        refresh_token: 'outlook_refresh_token',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({ mail: null, userPrincipalName: 'merchant@hotmail.test' }));

    const res = await POST(new Request('http://localhost/api/integrations/outlook/callback?code=oauth_code&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?connected=outlook');

    const rows = await db.integration.findMany({
      where: { organizationId: org!.id, platform: ChannelType.email },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].externalAccountId).toBe('merchant@hotmail.test');
  });

  it('redirects to access_denied when user cancels', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/outlook/callback?error=access_denied'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=access_denied');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: 'access_denied' },
      '[Outlook OAuth] User denied access',
    );
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
