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
  vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
  vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
  vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
  vi.stubEnv('TIKTOK_SHOP_AUTH_URL', 'https://auth.tiktok.test/oauth/authorize');
  vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
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

describe('POST /api/integrations/tiktok-shop/callback', () => {
  it('exchanges the code and saves a TikTok Shop seller integration', async () => {
    mockSavedCookies({
      tiktok_shop_oauth_state: 'state_123',
      tiktok_shop_oauth_org: org!.clerkOrgId,
      tiktok_shop_oauth_user: 'usr_oauth',
      tiktok_shop_oauth_return: '/dashboard/integrations',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        access_token: 'tts_access',
        refresh_token: 'tts_refresh',
        expires_in: 3600,
        shop_id: 'shop_123',
        seller_id: 'seller_123',
        shop_name: 'Fixture TikTok Shop',
        region: 'US',
        granted_scopes: ['buyer.message'],
      },
    }));

    const res = await POST(new Request('http://localhost/api/integrations/tiktok-shop/callback?code=oauth_code&state=state_123'));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations');

    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.tiktok },
    });
    expect(integration.externalAccountId).toBe('shop_123');
    expect(integration.accessToken).toBe('tts_access');
    expect(integration.refreshToken).toBe('tts_refresh');
    expect(integration.fromEmail).toBe('Fixture TikTok Shop');
    expect(integration.tokenExpiresAt).toBeInstanceOf(Date);
    expect(integration.metadata).toMatchObject({
      provider: 'tiktok_shop',
      shopId: 'shop_123',
      sellerId: 'seller_123',
      region: 'US',
      scopes: ['buyer.message'],
    });

    expect(mockFetch).toHaveBeenCalledWith('https://auth.tiktok.test/token', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"auth_code":"oauth_code"'),
    }));
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
