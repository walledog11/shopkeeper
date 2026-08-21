import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockAuth, mockShopifyRestJson } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockShopifyRestJson: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

// Only the network call is stubbed. ShopifyRequestError stays real, because the
// error path is selected by `instanceof` — a fake class would make that branch
// pass for the wrong reason.
vi.mock('@shopkeeper/agent/shopify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shopkeeper/agent/shopify')>()),
  shopifyRestJson: mockShopifyRestJson,
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { GET } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

const call = (query: string) =>
  GET(new Request(`http://localhost/api/shopify/customers/search${query}`));

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_search', orgId: org.clerkOrgId });
  mockShopifyRestJson.mockResolvedValue({ customers: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  vi.clearAllMocks();
});

describe('GET /api/shopify/customers/search', () => {
  it('returns matching customers for a connected store', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });
    mockShopifyRestJson.mockResolvedValue({
      customers: [{ id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' }],
    });

    const response = await call('?q=ada');
    const body = (await response.json()) as { customers: unknown[] };

    expect(response.status).toBe(200);
    expect(body.customers).toHaveLength(1);
  });

  it('asks Shopify only for the fields it renders', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });

    await call('?q=ada');

    // The response is rendered in a picker. Over-requesting fields would pull
    // addresses and order history through a search endpoint that never shows them.
    expect(mockShopifyRestJson).toHaveBeenCalledWith(
      expect.anything(),
      'customers/search.json',
      expect.objectContaining({
        query: { query: 'ada', limit: 8, fields: 'id,first_name,last_name,email' },
      }),
    );
  });

  it("searches the caller's store, never another org's", async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });
    await createTestIntegration(otherOrg!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'victim-shop.myshopify.com',
      accessToken: 'shpat_victim',
    });

    await call('?q=ada');

    const [ctx] = mockShopifyRestJson.mock.calls[0] as [{ shop: string; accessToken: string }];
    expect(ctx.shop).toBe('caller-shop.myshopify.com');
    expect(ctx.accessToken).toBe('shpat_caller');
  });

  it('short-circuits a query under two characters without calling Shopify', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });

    for (const query of ['', '?q=', '?q=a', '?q=%20%20']) {
      const response = await call(query);
      await expect(response.json()).resolves.toEqual({ customers: [] });
    }

    // A picker fires this on every keystroke; the guard is what keeps the
    // first two of them off Shopify's rate limit.
    expect(mockShopifyRestJson).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace before applying the length guard', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });

    await call('?q=%20ada%20');

    expect(mockShopifyRestJson).toHaveBeenCalledWith(
      expect.anything(),
      'customers/search.json',
      expect.objectContaining({ query: expect.objectContaining({ query: 'ada' }) }),
    );
  });

  it('reports 404 no_integration when the org has not connected Shopify', async () => {
    const response = await call('?q=ada');

    expect(response.status).toBe(404);
    expect(mockShopifyRestJson).not.toHaveBeenCalled();
  });

  it('marks the integration auth-invalid when Shopify rejects the token', async () => {
    const integration = await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_revoked',
    });
    mockShopifyRestJson.mockRejectedValue(
      new ShopifyRequestError('unauthorized', { status: 401, payload: { errors: 'bad token' } }),
    );

    const response = await call('?q=ada');

    expect(response.status).toBe(401);
    // The side effect is the point: a revoked token must stop the rest of the
    // app treating this integration as operational.
    const stored = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(stored.tokenExpiresAt).not.toBeNull();
    expect(stored.tokenExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('does not mark the integration invalid for a non-auth Shopify failure', async () => {
    const integration = await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });
    mockShopifyRestJson.mockRejectedValue(
      new ShopifyRequestError('rate limited', { status: 429, payload: {} }),
    );

    const response = await call('?q=ada');

    expect(response.status).toBe(429);
    // A 429 is transient. Expiring the token here would turn a retryable blip
    // into a reconnect prompt for the merchant.
    const stored = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(stored.tokenExpiresAt).toBeNull();
  });

  it('surfaces an unexpected non-Shopify failure as a server error', async () => {
    await createTestIntegration(org!.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'caller-shop.myshopify.com',
      accessToken: 'shpat_caller',
    });
    mockShopifyRestJson.mockRejectedValue(new Error('socket hang up'));

    const response = await call('?q=ada');

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('socket hang up');
  });
});
