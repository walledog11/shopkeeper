import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@clerk/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@clerk/db/test-helpers';

const { mockShopifyRestJson } = vi.hoisted(() => ({
  mockShopifyRestJson: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@clerk/agent/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clerk/agent/shopify')>();
  return {
    ...actual,
    shopifyRestJson: mockShopifyRestJson,
  };
});

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_shopify_customers',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('POST /api/shopify/customers', () => {
  it('rejects malformed JSON without calling Shopify', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: 'customers-shop.myshopify.com',
      accessToken: 'customers-token',
    });

    const res = await POST(new Request('http://localhost/api/shopify/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));

    expect(res.status).toBe(400);
    expect(mockShopifyRestJson).not.toHaveBeenCalled();
  });
});
