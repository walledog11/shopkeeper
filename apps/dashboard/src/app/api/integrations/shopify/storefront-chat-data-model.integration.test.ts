import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>>;

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

async function createShopifyIntegration(orgId: string) {
  return createTestIntegration(orgId, {
    platform: ChannelType.shopify,
    externalAccountId: `shop-${orgId}.myshopify.com`,
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
});

describe('storefront chat data model', () => {
  it('opens a session with no customer and no thread', async () => {
    const integration = await createShopifyIntegration(org.id);

    const session = await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        storefrontHost: 'shop.example.test',
        resumeSecretHash: 'a'.repeat(64),
        expiresAt: FUTURE,
      },
    });

    expect(session.customerId).toBeNull();
    expect(session.threadId).toBeNull();
    expect(session.revokedAt).toBeNull();
    await expect(db.thread.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });

  it('accepts shopify_chat as a thread channel distinct from shopify', async () => {
    const customer = await createTestCustomer(org.id, 'shopify_chat:session-1');
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);

    expect(thread.channelType).toBe('shopify_chat');
    await expect(
      db.thread.count({ where: { organizationId: org.id, channelType: ChannelType.shopify } }),
    ).resolves.toBe(0);
  });

  it('rejects a session pointing at another workspace’s integration', async () => {
    const foreignIntegration = await createShopifyIntegration(otherOrg.id);

    await expect(db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: foreignIntegration.id,
        storefrontHost: 'shop.example.test',
        resumeSecretHash: 'b'.repeat(64),
        expiresAt: FUTURE,
      },
    })).rejects.toThrow();
  });

  it('rejects attaching another workspace’s customer or thread', async () => {
    const integration = await createShopifyIntegration(org.id);
    const foreignCustomer = await createTestCustomer(otherOrg.id, 'shopify_chat:foreign');
    const foreignThread = await createTestThread(
      otherOrg.id,
      foreignCustomer.id,
      ChannelType.shopify_chat,
    );

    const base = {
      organizationId: org.id,
      integrationId: integration.id,
      storefrontHost: 'shop.example.test',
      expiresAt: FUTURE,
    };

    await expect(db.storefrontChatSession.create({
      data: { ...base, resumeSecretHash: 'c'.repeat(64), customerId: foreignCustomer.id },
    })).rejects.toThrow();

    await expect(db.storefrontChatSession.create({
      data: { ...base, resumeSecretHash: 'd'.repeat(64), threadId: foreignThread.id },
    })).rejects.toThrow();
  });

  it('drops sessions when the Shopify integration is disconnected', async () => {
    const integration = await createShopifyIntegration(org.id);
    await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        storefrontHost: 'shop.example.test',
        resumeSecretHash: 'e'.repeat(64),
        expiresAt: FUTURE,
      },
    });

    await db.integration.delete({ where: { id: integration.id } });

    await expect(
      db.storefrontChatSession.count({ where: { organizationId: org.id } }),
    ).resolves.toBe(0);
  });
});
