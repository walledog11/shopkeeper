import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

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
const extraOrgIds: string[] = [];

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('INSTAGRAM_APP_ID', 'instagram-app-id');
  vi.stubEnv('INSTAGRAM_APP_SECRET', 'instagram-app-secret');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockSavedCookies({
    ig_oauth_state: 'state_123',
    ig_oauth_org: org.clerkOrgId,
    ig_oauth_user: 'usr_oauth',
    ig_oauth_return: '/dashboard/settings',
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  for (const orgId of extraOrgIds.splice(0)) await cleanupTestData(orgId);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/integrations/instagram/callback', () => {
  it('rejects a state mismatch before calling Instagram or mutating the database', async () => {
    mockSavedCookies({
      ig_oauth_state: 'different_state',
      ig_oauth_org: org!.clerkOrgId,
      ig_oauth_user: 'usr_oauth',
    });

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=state_mismatch',
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
  });

  it('subscribes, verifies, and saves an Instagram Login integration', async () => {
    mockSuccessfulProvider({ shortTokenUserId: 17_841_400_000_000_000 });
    const before = Date.now();

    const response = await postCallback();

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://dashboard.test/dashboard/settings');

    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.ig_dm },
    });
    expect(integration.externalAccountId).toBe('ig_123');
    expect(integration.accessToken).toBe('long_instagram_token');
    expect(integration.refreshToken).toBeNull();
    expect(integration.fromEmail).toBe('fixture_shop');
    expect(integration.tokenExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 5_183_999_000);
    expect(integration.metadata).toMatchObject({
      instagram: {
        accessTokenIssuedAt: expect.any(String),
        accountType: 'BUSINESS',
        authModel: 'instagram_login',
        grantedScopes: [
          'instagram_business_basic',
          'instagram_business_manage_messages',
        ],
        permissionsVerified: true,
        subscribedFields: ['messages'],
        username: 'fixture_shop',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://api.instagram.com/oauth/access_token');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(String(mockFetch.mock.calls[1][0])).toContain('https://graph.instagram.com/access_token?');
    expect(String(mockFetch.mock.calls[2][0])).toBe(
      'https://graph.instagram.com/v25.0/me?fields=user_id%2Cusername%2Caccount_type',
    );
    expect(mockFetch.mock.calls[2][1]).toMatchObject({
      headers: { Authorization: 'Bearer long_instagram_token' },
      method: 'GET',
    });
    expect(String(mockFetch.mock.calls[3][0])).toBe(
      'https://graph.instagram.com/v25.0/ig_123/subscribed_apps',
    );
    expect(mockFetch.mock.calls[3][1]).toMatchObject({ method: 'POST' });
    expect(mockFetch.mock.calls[4][1]).toMatchObject({ method: 'GET' });
  });

  it('fails closed when the long-lived token exchange fails', async () => {
    mockFetch
      .mockResolvedValueOnce(shortTokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 190, message: 'Invalid token', fbtrace_id: 'trace-long-token' },
      }, { status: 400 }));

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=long_lived_token_failed',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a response that explicitly omits a required permission', async () => {
    mockFetch.mockResolvedValueOnce(shortTokenResponse({
      permissions: ['instagram_business_basic'],
    }));

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=missing_instagram_permissions',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-professional Instagram account', async () => {
    mockSuccessfulProvider({ accountType: 'PERSONAL' }, 3);

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=not_professional_account',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not persist a connection when subscription fails', async () => {
    mockSuccessfulProvider({}, 3);
    mockFetch.mockResolvedValueOnce(jsonResponse({
      error: { code: 200, message: 'Permission denied', fbtrace_id: 'trace-subscribe' },
    }, { status: 403 }));

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=webhook_subscription_failed',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('compensates when read-back does not confirm the messages subscription', async () => {
    mockSuccessfulProvider({}, 4);
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ subscribed_fields: ['comments'] }] }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=webhook_subscription_failed',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(mockFetch.mock.calls[5][1]).toMatchObject({ method: 'DELETE' });
  });

  it('compensates when persistence fails after subscription succeeds', async () => {
    mockSuccessfulProvider({ username: 'x'.repeat(300) });
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=server_error',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(mockFetch.mock.calls[5][1]).toMatchObject({ method: 'DELETE' });
  });

  it('rejects an Instagram account owned by another workspace before subscribing', async () => {
    const otherOrg = await createTestOrg();
    extraOrgIds.push(otherOrg.id);
    await createTestIntegration(otherOrg.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: 'ig_123',
      accessToken: 'other-token',
    });
    mockSuccessfulProvider({}, 3);

    const response = await postCallback();

    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations?error=instagram_account_in_use',
    );
    expect(await instagramIntegrationCount(org!.id)).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('updates a same-account reconnect in place', async () => {
    const existing = await createTestIntegration(org!.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: 'ig_123',
      accessToken: 'old-token',
      metadata: { retained: 'value' },
    });
    const customer = await createTestCustomer(org!.id, 'igsid_existing');
    const thread = await createTestThread(org!.id, customer.id, ChannelType.ig_dm);
    await db.thread.update({
      where: { id: thread.id },
      data: { replyIntegrationId: existing.id },
    });
    mockSuccessfulProvider();

    await postCallback();

    const integrations = await db.integration.findMany({
      where: { organizationId: org!.id, platform: ChannelType.ig_dm },
    });
    expect(integrations).toHaveLength(1);
    expect(integrations[0]).toMatchObject({
      id: existing.id,
      accessToken: 'long_instagram_token',
      externalAccountId: 'ig_123',
      refreshToken: null,
    });
    expect(integrations[0].metadata).toMatchObject({ retained: 'value' });
    await expect(db.thread.findUniqueOrThrow({ where: { id: thread.id } }))
      .resolves.toMatchObject({ replyIntegrationId: existing.id });
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('replaces a different account and leaves old threads read-only', async () => {
    const existing = await createTestIntegration(org!.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: 'ig_old',
      accessToken: 'old-token',
    });
    const customer = await createTestCustomer(org!.id, 'igsid_old');
    const thread = await createTestThread(org!.id, customer.id, ChannelType.ig_dm);
    await db.thread.update({
      where: { id: thread.id },
      data: { replyIntegrationId: existing.id },
    });
    mockSuccessfulProvider();
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    await postCallback();

    const replacement = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.ig_dm },
    });
    expect(replacement.id).not.toBe(existing.id);
    expect(replacement.externalAccountId).toBe('ig_123');
    await expect(db.thread.findUniqueOrThrow({ where: { id: thread.id } }))
      .resolves.toMatchObject({ replyIntegrationId: null });
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(String(mockFetch.mock.calls[5][0])).toContain('/ig_old/subscribed_apps');
    expect(mockFetch.mock.calls[5][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer old-token' }),
      method: 'DELETE',
    });
  });
});

function postCallback() {
  return POST(new Request(
    'http://localhost/api/integrations/instagram/callback?code=oauth_code&state=state_123',
  ));
}

function mockSuccessfulProvider(
  input: {
    accountId?: string;
    accountType?: string;
    permissions?: string[];
    shortTokenUserId?: string | number;
    username?: string;
  } = {},
  responseCount = 5,
) {
  const responses = [
    shortTokenResponse({
      permissions: input.permissions ?? [
        'instagram_business_basic',
        'instagram_business_manage_messages',
      ],
      userId: input.shortTokenUserId ?? input.accountId,
    }),
    jsonResponse({
      access_token: 'long_instagram_token',
      expires_in: 5_184_000,
      token_type: 'bearer',
    }),
    jsonResponse({
      account_type: input.accountType ?? 'BUSINESS',
      user_id: input.accountId ?? 'ig_123',
      username: input.username ?? 'fixture_shop',
    }),
    jsonResponse({ success: true }),
    jsonResponse({ data: [{ subscribed_fields: ['messages'] }] }),
  ];
  for (const response of responses.slice(0, responseCount)) {
    mockFetch.mockResolvedValueOnce(response);
  }
}

function shortTokenResponse(input: { permissions?: string[]; userId?: string | number } = {}) {
  return jsonResponse({
    access_token: 'short_instagram_token',
    permissions: input.permissions ?? [
      'instagram_business_basic',
      'instagram_business_manage_messages',
    ],
    user_id: input.userId ?? 'ig_123',
  });
}

async function instagramIntegrationCount(organizationId: string) {
  return db.integration.count({
    where: { organizationId, platform: ChannelType.ig_dm },
  });
}

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
