import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

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
  vi.stubEnv('META_APP_ID', 'meta-app-id');
  vi.stubEnv('META_APP_SECRET', 'meta-app-secret');
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

describe('POST /api/integrations/instagram/callback', () => {
  it('subscribes the page and saves the Instagram integration', async () => {
    mockSavedCookies({
      ig_oauth_state: 'state_123',
      ig_oauth_org: org!.clerkOrgId,
      ig_oauth_user: 'usr_oauth',
      ig_oauth_return: '/dashboard/settings',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short_user_token' }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'long_user_token' }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{
          id: 'page_123',
          name: 'Fixture Page',
          access_token: 'page_access_token',
          instagram_business_account: {
            id: 'ig_123',
            username: 'fixture_shop',
          },
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const res = await POST(new Request('http://localhost/api/integrations/instagram/callback?code=oauth_code&state=state_123'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/settings');

    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.ig_dm },
    });
    expect(integration.externalAccountId).toBe('ig_123');
    expect(integration.accessToken).toBe('page_access_token');
    expect(integration.refreshToken).toBe('long_user_token');
    expect(integration.fromEmail).toBe('fixture_shop');
    expect(integration.tokenExpiresAt).toBeInstanceOf(Date);

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(String(mockFetch.mock.calls[3][0])).toBe('https://graph.facebook.com/v22.0/page_123/subscribed_apps');
    expect(mockFetch.mock.calls[3][1]).toMatchObject({ method: 'POST' });
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
