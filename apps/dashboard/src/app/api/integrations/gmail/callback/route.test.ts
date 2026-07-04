import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  NoopAnalyticsSink,
  RecordingAnalyticsSink,
  installProductAnalytics,
} from '@shopkeeper/analytics';
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
let analyticsSink: RecordingAnalyticsSink;

beforeEach(async () => {
  org = await createTestOrg();
  analyticsSink = new RecordingAnalyticsSink();
  installProductAnalytics({ sink: analyticsSink, environment: 'test' });
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-client-secret');
  vi.stubEnv('GMAIL_PUBSUB_TOPIC', 'projects/test-project/topics/gmail-inbound');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  installProductAnalytics({ sink: new NoopAnalyticsSink(), environment: 'test' });
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/integrations/gmail/callback', () => {
  it('rejects state mismatch before token exchange', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'usr_oauth',
    });

    const res = await POST(new Request('http://localhost/api/integrations/gmail/callback?code=abc&state=other_state'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith('[Gmail OAuth] State mismatch — possible CSRF attempt');
    expect(analyticsSink.events).toEqual([
      expect.objectContaining({
        event: 'integration_connection_failed',
        distinctId: org!.id,
        properties: expect.objectContaining({
          platform: 'email',
          failure_category: 'state_mismatch',
          '$insert_id': 'integration_connection_failed:state_123',
        }),
      }),
    ]);
  });

  it('rejects user session mismatch', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'someone_else',
    });

    const res = await POST(new Request('http://localhost/api/integrations/gmail/callback?code=abc&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=state_mismatch');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { savedUserId: 'someone_else', currentUserId: 'usr_oauth' },
      '[Gmail OAuth] User session mismatch — possible CSRF attempt',
    );
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
    const existingGmail = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'old-gmail-access-token',
        refreshToken: 'old-gmail-refresh-token',
        tokenExpiresAt: new Date(0),
        metadata: {
          provider: 'gmail',
          inboundMode: 'hybrid',
          gmail: {
            inboundStatus: 'degraded',
            lastError: 'watch_setup_failed',
          },
        },
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
        scope: 'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      }))
      .mockResolvedValueOnce(jsonResponse({ email: 'merchant@gmail.test' }))
      .mockResolvedValueOnce(jsonResponse({
        historyId: '12345',
        expiration: '1783382400000',
      }));

    const res = await POST(new Request('http://localhost/api/integrations/gmail/callback?code=oauth_code&state=state_123'));

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
    expect(integration.metadata).toMatchObject({
      provider: 'gmail',
      inboundMode: 'hybrid',
      oauthScopes: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
      gmail: {
        inboundStatus: 'active',
        historyId: '12345',
        watchExpiration: '1783382400000',
      },
    });
    expect(integration.id).toBe(existingGmail.id);
    expect(integration.id).not.toBe(staleEmail.id);
    expect(analyticsSink.events).toEqual([
      expect.objectContaining({
        event: 'integration_connection_completed',
        distinctId: org!.id,
        properties: expect.objectContaining({
          platform: 'email',
          '$insert_id': `integration_connection_completed:${integration.id}`,
        }),
      }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://oauth2.googleapis.com/token');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://openidconnect.googleapis.com/v1/userinfo');
    expect(String(mockFetch.mock.calls[2][0])).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
    );
    expect(mockFetch.mock.calls[2][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        topicName: 'projects/test-project/topics/gmail-inbound',
        labelIds: ['INBOX'],
        labelFilterBehavior: 'include',
      }),
    });
  });

  it('keeps outbound connected and marks inbound degraded when watch setup fails', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'usr_oauth',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'gmail_access_token',
        refresh_token: 'gmail_refresh_token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      }))
      .mockResolvedValueOnce(jsonResponse({ email: 'merchant@gmail.test' }))
      .mockResolvedValueOnce(jsonResponse(
        { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
        { status: 429 },
      ));

    const res = await POST(new Request(
      'http://localhost/api/integrations/gmail/callback?code=oauth_code&state=state_123',
    ));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?connected=gmail',
    );
    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.email },
    });
    expect(integration.accessToken).toBe('gmail_access_token');
    expect(integration.refreshToken).toBe('gmail_refresh_token');
    expect(integration.metadata).toMatchObject({
      provider: 'gmail',
      gmail: {
        inboundStatus: 'degraded',
        lastError: 'watch_quota',
      },
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        integrationId: integration.id,
        errorCategory: 'watch_quota',
      },
      '[Gmail Watch] Watch registration failed',
    );
  });

  it('records the read scope after a successful watch when Google omits scope', async () => {
    mockSavedCookies({
      gmail_oauth_state: 'state_123',
      gmail_oauth_org: org!.clerkOrgId,
      gmail_oauth_user: 'usr_oauth',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'gmail_access_token',
        refresh_token: 'gmail_refresh_token',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({ email: 'merchant@gmail.test' }))
      .mockResolvedValueOnce(jsonResponse({
        historyId: '67890',
        expiration: '1783382400000',
      }));

    const res = await POST(new Request(
      'http://localhost/api/integrations/gmail/callback?code=oauth_code&state=state_123',
    ));

    expect(res.status).toBe(307);
    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.email },
    });
    expect(integration.metadata).toMatchObject({
      oauthScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      gmail: {
        inboundStatus: 'active',
        historyId: '67890',
      },
    });
  });

  it('redirects to access_denied when user cancels', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/gmail/callback?error=access_denied'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations?error=access_denied');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: 'access_denied' },
      '[Gmail OAuth] User denied access',
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
