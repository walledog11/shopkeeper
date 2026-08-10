import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

const {
  mockCaptureCompleted,
  mockCaptureFailed,
  mockCaptureOAuthFailed,
  mockCookieDelete,
  mockCookieGet,
  mockFetch,
  mockLogger,
} = vi.hoisted(() => ({
  mockCaptureCompleted: vi.fn(),
  mockCaptureFailed: vi.fn(),
  mockCaptureOAuthFailed: vi.fn(),
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

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: mockCookieGet, delete: mockCookieDelete })),
}));
vi.mock('@/lib/server/logger', () => ({ default: mockLogger }));
vi.mock('@/lib/server/product-analytics', () => ({
  captureIntegrationConnectionCompleted: mockCaptureCompleted,
  captureIntegrationConnectionFailed: mockCaptureFailed,
  captureOAuthIntegrationConnectionFailed: mockCaptureOAuthFailed,
}));
vi.stubGlobal('fetch', mockFetch);

import { auth } from '@clerk/nextjs/server';
import { completeShopifyOAuth } from './complete-shopify-oauth';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null;
const extraOrgIds: string[] = [];
const SHOP = 'shopify-callback-fixture.myshopify.com';
const STATE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('SHOPIFY_CLIENT_ID', 'shopify-client-id');
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'shopify-client-secret');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockFetch.mockReset();
  mockSavedCookies({ shop: SHOP });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  for (const orgId of extraOrgIds.splice(0)) await cleanupTestData(orgId);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/integrations/shopify/callback', () => {
  it('connects the store, emits one completion, and makes no webhook requests', async () => {
    mockSavedCookies({ shop: SHOP, returnTo: '/dashboard/settings' });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'shpat_fixture',
        scope: 'write_orders, read_orders,write_orders,READ_PRODUCTS',
      }))
      .mockResolvedValueOnce(shopResponse());

    const response = await POST(callbackRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://dashboard.test/dashboard/integrations/oauth/complete?provider=shopify&status=connected&mode=redirect&returnTo=%2Fdashboard%2Fsettings',
    );
    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.shopify },
    });
    expect(integration).toMatchObject({
      accessToken: 'shpat_fixture',
      externalAccountId: SHOP,
      fromEmail: 'Fixture Shop',
      metadata: { oauthScopes: ['read_orders', 'read_products', 'write_orders'] },
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls.map(([input]) => String(input)))
      .not.toEqual(expect.arrayContaining([expect.stringContaining('webhooks.json')]));
    expect(mockCaptureCompleted).toHaveBeenCalledTimes(1);
    expect(mockCaptureCompleted).toHaveBeenCalledWith({
      integrationId: integration.id,
      organizationId: org!.id,
      platform: 'shopify',
    });
    expect(mockCaptureFailed).not.toHaveBeenCalled();
  });

  it('reconnects the canonical integration and preserves unrelated metadata', async () => {
    const existing = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.shopify,
        externalAccountId: SHOP,
        accessToken: 'shpat_old',
        metadata: {
          oauthScopes: ['read_orders'],
          providerNote: 'preserve me',
          simulated: false,
        },
      },
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'shpat_refreshed',
        scope: ' write_customers,read_orders,write_customers ',
      }))
      .mockResolvedValueOnce(shopResponse());

    const response = await POST(callbackRequest());

    expect(response.headers.get('location')).toContain('status=connected');
    const integration = await db.integration.findUniqueOrThrow({ where: { id: existing.id } });
    expect(integration.accessToken).toBe('shpat_refreshed');
    expect(integration.metadata).toEqual({
      oauthScopes: ['read_orders', 'write_customers'],
      providerNote: 'preserve me',
      simulated: false,
    });
    expect(mockCaptureCompleted).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed callback fields before contacting Shopify', async () => {
    const response = await POST(callbackRequest({ code: null }));

    expect(response.headers.get('location')).toContain('error=shopify_invalid_callback');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'invalid_callback',
    }));
  });

  it('rejects an invalid HMAC before contacting Shopify', async () => {
    const url = new URL(callbackUrl());
    url.searchParams.set('hmac', 'bad-signature');

    const response = await POST(new Request(url));

    expect(response.headers.get('location')).toContain('error=shopify_hmac_invalid');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'invalid_callback',
    }));
  });

  it.each([
    [400, 'shopify_token_failed', 'invalid_credentials'],
    [429, 'shopify_server_error', 'rate_limited'],
    [503, 'shopify_server_error', 'provider_unavailable'],
  ] as const)('classifies token exchange HTTP %s', async (status, error, failureCategory) => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'exchange failed' }, { status }));

    const response = await POST(callbackRequest());

    expect(response.headers.get('location')).toContain(`error=${error}`);
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({ failureCategory }));
    expect(mockCaptureCompleted).not.toHaveBeenCalled();
  });

  it('classifies token exchange timeouts as provider unavailable', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    const response = await POST(callbackRequest());

    expect(response.headers.get('location')).toContain('error=shopify_server_error');
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'provider_unavailable',
    }));
  });

  it('classifies malformed token success payloads as unknown', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ scope: 'read_orders' }));

    const response = await POST(callbackRequest());

    expect(response.headers.get('location')).toContain('error=shopify_server_error');
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'unknown',
    }));
  });

  it('rejects a different permanent store identity', async () => {
    mockSavedCookies({ shop: SHOP });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(jsonResponse({
        shop: { id: 1, name: 'Evil Shop', myshopify_domain: 'evil-shop.myshopify.com' },
      }))
      .mockResolvedValueOnce(shopResponse({ id: 2 }));

    const response = await POST(callbackRequest({ shop: 'evil-shop.myshopify.com' }));

    expect(response.headers.get('location')).toContain('error=shopify_shop_mismatch');
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'validation_failed',
    }));
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('accepts a myshopify domain alias for the same permanent store', async () => {
    mockSavedCookies({ shop: 'almond-9567.myshopify.com' });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(shopResponse({
        id: 42,
        myshopifyDomain: 'rxcemn-vt.myshopify.com',
      }))
      .mockResolvedValueOnce(shopResponse({
        id: 42,
        myshopifyDomain: 'rxcemn-vt.myshopify.com',
      }));

    const response = await POST(callbackRequest({ shop: 'rxcemn-vt.myshopify.com' }));

    expect(response.headers.get('location')).toContain('status=connected');
    const integration = await db.integration.findFirstOrThrow({
      where: { organizationId: org!.id, platform: ChannelType.shopify },
    });
    expect(integration.externalAccountId).toBe('rxcemn-vt.myshopify.com');
  });

  it('rejects a store already owned by another workspace', async () => {
    const otherOrg = await createTestOrg();
    extraOrgIds.push(otherOrg.id);
    const incumbent = await db.integration.create({
      data: {
        organizationId: otherOrg.id,
        platform: ChannelType.shopify,
        externalAccountId: SHOP,
        accessToken: 'shpat_other_workspace',
      },
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ access_token: 'shpat_fixture' }))
      .mockResolvedValueOnce(shopResponse());

    const response = await POST(callbackRequest());

    expect(response.headers.get('location')).toContain('error=shopify_store_in_use');
    expect(await db.integration.count({
      where: { organizationId: org!.id, platform: ChannelType.shopify },
    })).toBe(0);
    expect((await db.integration.findUniqueOrThrow({ where: { id: incumbent.id } })).accessToken)
      .toBe('shpat_other_workspace');
    expect(mockCaptureCompleted).not.toHaveBeenCalled();
  });

  it('allows only one workspace to win concurrent claims for a store', async () => {
    const otherOrg = await createTestOrg();
    extraOrgIds.push(otherOrg.id);
    mockFetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/admin/oauth/access_token')) {
        const code = (JSON.parse(String(init?.body)) as { code: string }).code;
        return jsonResponse({ access_token: `token-${code}` });
      }
      if (url.endsWith('/admin/api/2026-04/shop.json')) return shopResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const [first, second] = await Promise.all([
      completeShopifyOAuth({
        clientId: 'shopify-client-id',
        clientSecret: 'shopify-client-secret',
        organizationId: org!.id,
        savedShop: SHOP,
        searchParams: signedParams({ code: 'first', shop: SHOP, state: STATE }),
      }),
      completeShopifyOAuth({
        clientId: 'shopify-client-id',
        clientSecret: 'shopify-client-secret',
        organizationId: otherOrg.id,
        savedShop: SHOP,
        searchParams: signedParams({ code: 'second', shop: SHOP, state: STATE }),
      }),
    ]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ error: 'shopify_store_in_use' }),
    ]);
    expect(await db.integration.count({
      where: { platform: ChannelType.shopify, externalAccountId: SHOP },
    })).toBe(1);
  });
});

function mockSavedCookies({ shop, returnTo }: { shop: string; returnTo?: string }) {
  const attempt = Buffer.from(JSON.stringify({
    userId: 'usr_oauth',
    orgId: org!.clerkOrgId,
    returnTo: returnTo ?? null,
    mode: 'redirect',
    extra: { shop },
  })).toString('base64url');
  mockCookieGet.mockImplementation((name: string) => (
    name === `shopify_oauth_attempt_${STATE}` ? { value: attempt } : undefined
  ));
}

function callbackRequest(overrides: { code?: string | null; shop?: string; state?: string } = {}) {
  return new Request(callbackUrl(overrides));
}

function callbackUrl(overrides: { code?: string | null; shop?: string; state?: string } = {}) {
  const values: Record<string, string> = {
    code: overrides.code ?? 'oauth_code',
    shop: overrides.shop ?? SHOP,
    state: overrides.state ?? STATE,
  };
  if (overrides.code === null) delete values.code;
  const params = signedParams(values);
  return `http://localhost/api/integrations/shopify/callback?${params.toString()}`;
}

function signedParams(values: Record<string, string>) {
  const message = Object.keys(values)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join('&');
  const hmac = createHmac('sha256', 'shopify-client-secret').update(message).digest('hex');
  return new URLSearchParams({ ...values, hmac });
}

function shopResponse({
  id = 7,
  myshopifyDomain = SHOP,
}: { id?: number; myshopifyDomain?: string } = {}) {
  return jsonResponse({
    shop: { id, name: 'Fixture Shop', myshopify_domain: myshopifyDomain },
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
