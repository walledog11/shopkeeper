import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { GET } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_products',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  otherOrg = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/shopify/products', () => {
  it('returns 404 without using Shopify credentials from another org', async () => {
    otherOrg = await createTestOrg();
    await createTestIntegration(otherOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'foreign-products.myshopify.com',
      accessToken: 'foreign-products-token',
    });

    const res = await GET(new Request('http://localhost/api/shopify/products?q=tee'));

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns provider non-OK responses with the active org Shopify credentials', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'active-products.myshopify.com',
      accessToken: 'active-products-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: 'throttled' }, { status: 429 }));

    const res = await GET(new Request('http://localhost/api/shopify/products?status=active'));
    const body = await res.json() as { error: string; details: unknown };

    expect(res.status).toBe(429);
    expect(body).toEqual({ error: 'shopify_error', details: { errors: 'throttled' } });
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://active-products.myshopify.com/admin/api/2026-04/products.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { 'X-Shopify-Access-Token': 'active-products-token' },
    });
  });

  it('returns an empty product list when Shopify has no products', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'empty-products.myshopify.com',
      accessToken: 'empty-products-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ products: [] }));

    const res = await GET(new Request('http://localhost/api/shopify/products'));
    const body = await res.json() as { products: unknown[]; nextPageInfo: string | null; shop: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      products: [],
      nextPageInfo: null,
      shop: 'empty-products.myshopify.com',
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
