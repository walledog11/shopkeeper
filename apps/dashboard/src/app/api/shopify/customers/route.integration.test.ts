import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClerkSession } from '@/test-fixtures/clerk-session';
import { ChannelType } from '@shopkeeper/db';
import { cleanupTestData, createTestIntegration, createTestOrg } from '@shopkeeper/db/test-helpers';

const { mockCreateShopifyCustomerRecord } = vi.hoisted(() => ({
  mockCreateShopifyCustomerRecord: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@shopkeeper/agent/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/agent/shopify')>();
  return {
    ...actual,
    createShopifyCustomerRecord: mockCreateShopifyCustomerRecord,
  };
});

import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockClerkSession({
    userId: 'usr_shopify_customers',
    orgId: org.clerkOrgId,
  });
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
    expect(mockCreateShopifyCustomerRecord).not.toHaveBeenCalled();
  });
});
