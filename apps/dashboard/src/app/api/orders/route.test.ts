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
    userId: 'usr_orders',
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

describe('GET /api/orders', () => {
  it('returns 404 without using Shopify credentials from another org', async () => {
    otherOrg = await createTestOrg();
    await createTestIntegration(otherOrg.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'foreign-orders.myshopify.com',
      accessToken: 'foreign-orders-token',
    });

    const res = await GET(new Request('http://localhost/api/orders?q=1001'));

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns provider non-OK order responses with the active org Shopify credentials', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'active-orders.myshopify.com',
      accessToken: 'active-orders-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: 'upstream unavailable' }, { status: 503 }));

    const res = await GET(new Request('http://localhost/api/orders?fulfillment_status=unfulfilled'));
    const body = await res.json() as { error: string; details: unknown };

    expect(res.status).toBe(503);
    expect(body).toEqual({ error: 'shopify_error', details: { errors: 'upstream unavailable' } });
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://active-orders.myshopify.com/admin/api/2026-04/orders.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { 'X-Shopify-Access-Token': 'active-orders-token' },
    });
  });

  it('returns an empty order list when Shopify has no orders', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'empty-orders.myshopify.com',
      accessToken: 'empty-orders-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ orders: [] }));

    const res = await GET(new Request('http://localhost/api/orders'));
    const body = await res.json() as { orders: unknown[]; nextPageInfo: string | null; shop: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      orders: [],
      nextPageInfo: null,
      shop: 'empty-orders.myshopify.com',
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
