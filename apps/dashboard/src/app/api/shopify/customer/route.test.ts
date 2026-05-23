import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@clerk/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@clerk/db/test-helpers';

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

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_shopify_customer',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/shopify/customer', () => {
  it('returns provider non-OK customer lookups without requesting orders', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'customer-shop.myshopify.com',
      accessToken: 'customer-token',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: 'invalid token' }, { status: 401 }));

    const res = await GET(new Request('http://localhost/api/shopify/customer?email=alice@example.com'));
    const body = await res.json() as { error: string; details: unknown };

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'shopify_error', details: { errors: 'invalid token' } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://customer-shop.myshopify.com/admin/api/2026-04/customers/search.json');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { 'X-Shopify-Access-Token': 'customer-token' },
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
