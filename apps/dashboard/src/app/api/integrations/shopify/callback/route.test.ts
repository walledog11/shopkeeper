import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockCookieDelete,
  mockCookieGet,
  mockFetch,
  mockLogger,
  mockRecordProviderSendFailure,
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
  mockRecordProviderSendFailure: vi.fn(),
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

vi.mock('@/lib/server/provider-send-alerts', () => ({
  recordProviderSendFailure: mockRecordProviderSendFailure,
}));

vi.mock('@/lib/server/logger', () => ({
  default: mockLogger,
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({
    incr: vi.fn(),
    expire: vi.fn(),
  })),
}));

vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('SHOPIFY_CLIENT_ID', 'shopify-client-id');
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'shopify-client-secret');
  vi.stubEnv('GATEWAY_INTERNAL_URL', 'http://gateway.test');
  vi.stubEnv('GATEWAY_PUBLIC_URL', 'http://gateway.test');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockRecordProviderSendFailure.mockResolvedValue({ emitted: false });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/integrations/shopify/callback', () => {
  it('rejects a callback for a different shop after verifying shop identity', async () => {
    mockSavedCookies({
      shopify_oauth_state: 'state_123',
      shopify_oauth_org: org!.clerkOrgId,
      shopify_oauth_user: 'usr_oauth',
      shopify_oauth_shop: 'fixture-shop.myshopify.com',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(jsonResponse({ shop: { id: 1, name: 'Evil Shop', myshopify_domain: 'evil-shop.myshopify.com' } }))
      .mockResolvedValueOnce(jsonResponse({ shop: { id: 2, name: 'Fixture Shop', myshopify_domain: 'fixture-shop.myshopify.com' } }));

    const res = await POST(new Request(signedCallbackUrl({
      code: 'oauth_code',
      shop: 'evil-shop.myshopify.com',
      state: 'state_123',
    })));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations/oauth/complete?error=shopify_shop_mismatch');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockLogger.error).toHaveBeenCalledWith(
      {
        shop: 'evil-shop.myshopify.com',
        savedShop: 'fixture-shop.myshopify.com',
        authorizedShopId: 1,
        requestedShopId: 2,
      },
      '[Shopify OAuth] Shop domain mismatch , possible CSRF attempt',
    );
  });

  it('accepts myshopify domain aliases for the same store', async () => {
    mockSavedCookies({
      shopify_oauth_state: 'state_123',
      shopify_oauth_org: org!.clerkOrgId,
      shopify_oauth_user: 'usr_oauth',
      shopify_oauth_shop: 'almond-9567.myshopify.com',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(jsonResponse({ shop: { id: 42, name: 'Palette Garments', myshopify_domain: 'rxcemn-vt.myshopify.com' } }))
      .mockResolvedValueOnce(jsonResponse({ shop: { id: 42, name: 'Palette Garments', myshopify_domain: 'rxcemn-vt.myshopify.com' } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 3 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 4 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 5 } }));

    const res = await POST(new Request(signedCallbackUrl({
      code: 'oauth_code',
      shop: 'rxcemn-vt.myshopify.com',
      state: 'state_123',
    })));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations/oauth/complete?connected=shopify');
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        shop: 'rxcemn-vt.myshopify.com',
        savedShop: 'almond-9567.myshopify.com',
        canonicalShop: 'rxcemn-vt.myshopify.com',
      },
      '[Shopify OAuth] Accepted myshopify domain alias',
    );

    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.shopify },
    });
    expect(integration.externalAccountId).toBe('rxcemn-vt.myshopify.com');
  });

  it('persists the active org integration and soft-fails webhook registration errors', async () => {
    mockSavedCookies({
      shopify_oauth_state: 'state_123',
      shopify_oauth_org: org!.clerkOrgId,
      shopify_oauth_user: 'usr_oauth',
      shopify_oauth_shop: 'fixture-shop.myshopify.com',
      shopify_oauth_return: '/dashboard/settings',
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(jsonResponse({ shop: { id: 7, name: 'Fixture Shop', myshopify_domain: 'fixture-shop.myshopify.com' } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ errors: 'topic disabled' }, { status: 422 }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 3 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 4 } }))
      .mockResolvedValueOnce(jsonResponse({ webhook: { id: 5 } }));

    const res = await POST(new Request(signedCallbackUrl({
      code: 'oauth_code',
      shop: 'fixture-shop.myshopify.com',
      state: 'state_123',
    })));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://dashboard.test/dashboard/integrations/oauth/complete?connected=shopify&returnTo=%2Fdashboard%2Fsettings');

    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.shopify },
    });
    expect(integration.externalAccountId).toBe('fixture-shop.myshopify.com');
    expect(integration.accessToken).toBe('shpat_fixture');
    expect(integration.fromEmail).toBe('Fixture Shop');

    expect(mockFetch).toHaveBeenCalledTimes(7);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { topic: 'orders/fulfilled', shop: 'fixture-shop.myshopify.com', err: { errors: 'topic disabled' } },
      '[Shopify OAuth] Webhook registration failed',
    );
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'shopify',
      'webhook_registration',
      org!.id,
      expect.objectContaining({
        integrationId: integration.id,
        detail: 'Shopify webhook registration failed for orders/fulfilled',
        extra: { topic: 'orders/fulfilled', shop: 'fixture-shop.myshopify.com' },
      }),
    );
  });
});

function mockSavedCookies(values: Record<string, string>) {
  mockCookieGet.mockImplementation((name: string) => {
    const value = values[name];
    return value ? { value } : undefined;
  });
}

function signedCallbackUrl(params: Record<string, string>) {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const hmac = createHmac('sha256', 'shopify-client-secret').update(message).digest('hex');
  const url = new URL('http://localhost/api/integrations/shopify/callback');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('hmac', hmac);
  return url.toString();
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
