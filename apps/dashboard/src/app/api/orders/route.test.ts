import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@shopkeeper/agent/testing';
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

    const res = await GET(new Request('http://localhost/api/orders?q=1001'));
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

  it.each([
    ['1001', 'name=%231001'],
    ['customer%40example.com', 'email=customer%40example.com'],
  ])('supports order-number and customer-email search', async (query, expectedQuery) => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'search-orders.myshopify.com',
      accessToken: 'search-orders-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ orders: [{
      id: 1,
      name: '#1001',
      created_at: '2026-01-01T00:00:00Z',
      financial_status: 'paid',
      fulfillment_status: null,
      total_price: '19.00',
      current_total_price: '18.00',
      currency: 'eur',
      customer: { id: 2, first_name: null, last_name: null, email: 'customer@example.com' },
      line_items: [],
    }] }));

    const res = await GET(new Request(`http://localhost/api/orders?q=${query}`));
    const body = await res.json() as { orders: Array<{ currency: string; total_price: string; customer: { name: null } }> };

    expect(res.status).toBe(200);
    expect(String(mockFetch.mock.calls[0][0])).toContain(expectedQuery);
    expect(body.orders[0]).toMatchObject({ currency: 'EUR', total_price: '18.00', customer: { name: null } });
  });

  it.each([
    'q=customer+name',
    'q=not-an-email',
    'limit=2.5',
    'limit=0',
    'limit=51',
    'page_info=',
    'fulfillment_status=unfulfilled',
  ])('returns 400 for malformed search parameters: %s', async query => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'invalid-orders.myshopify.com',
      accessToken: 'invalid-orders-token',
    });

    const res = await GET(new Request(`http://localhost/api/orders?${query}`));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('excludes refunded and voided search results while preserving the provider cursor', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'closed-orders.myshopify.com',
      accessToken: 'closed-orders-token',
    });
    const closed = (id: number, financialStatus: string) => ({
      id,
      name: `#${id}`,
      created_at: '2026-01-01T00:00:00Z',
      financial_status: financialStatus,
      fulfillment_status: null,
      total_price: '10.00',
      current_total_price: '10.00',
      currency: 'USD',
      customer: null,
      line_items: [],
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ orders: [closed(1, 'refunded'), closed(2, 'voided')] }, {
      headers: { Link: '<https://example.com?page_info=still-more>; rel="next"' },
    }));

    const res = await GET(new Request('http://localhost/api/orders?q=1001'));
    const body = await res.json() as { orders: unknown[]; nextPageInfo: string | null };
    expect(body).toEqual({ orders: [], nextPageInfo: 'still-more', shop: 'closed-orders.myshopify.com' });
  });
});

