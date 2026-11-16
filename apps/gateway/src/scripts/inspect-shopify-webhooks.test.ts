import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest, graphqlResponse } from '@shopkeeper/agent/testing';
import {
  matchingMigrationSubscriptions,
  migrateShopifyWebhooks,
  missingMigrationTopics,
  parseShopifyWebhookMigrationArgs,
  SHOPIFY_WEBHOOK_ADDRESS,
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookSubscription,
} from './inspect-shopify-webhooks.js';

const ctx = { shop: 'fixture.myshopify.com', accessToken: 'token' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Shopify webhook migration selection', () => {
  it('selects only the five exact topics at the exact gateway address', () => {
    const subscriptions = [
      hook(1, 'ORDERS_CREATE'),
      hook(2, 'ORDERS_CREATE', 'https://unrelated.example/webhooks/shopify'),
      hook(3, 'PRODUCTS_CREATE'),
    ];

    expect(matchingMigrationSubscriptions(subscriptions).map(({ id }) => id)).toEqual([gid(1)]);
    expect(missingMigrationTopics(subscriptions)).toEqual(SHOPIFY_WEBHOOK_TOPICS.slice(1));
  });

  it('requires an explicit shop and execute flag for mutations', () => {
    expect(parseShopifyWebhookMigrationArgs([])).toEqual({ mode: 'audit', execute: false });
    expect(() => parseShopifyWebhookMigrationArgs(['remove', '--shop', 'fixture.myshopify.com']))
      .toThrow('remove requires an explicit --shop <domain> and --execute.');
    expect(() => parseShopifyWebhookMigrationArgs(['restore', '--execute']))
      .toThrow('restore requires an explicit --shop <domain> and --execute.');
  });
});

describe('migrateShopifyWebhooks', () => {
  it('is read-only in default audit mode', async () => {
    const { requests } = fakeShopify([hook(1, 'ORDERS_CREATE')]);

    const result = await migrateShopifyWebhooks({ ctx, execute: false, mode: 'audit' });

    expect(result.before).toHaveLength(1);
    expect(requests).toEqual(['ShopkeeperWebhookSubscriptions']);
  });

  it('does not issue any request when remove lacks execute', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(migrateShopifyWebhooks({ ctx, execute: false, mode: 'remove' }))
      .rejects.toThrow('remove requires --execute.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes duplicate matches without touching unrelated subscriptions', async () => {
    const unrelated = hook(9, 'ORDERS_CREATE', 'https://unrelated.example/hook');
    const { requests, subscriptions, deleted } = fakeShopify([
      hook(1, 'ORDERS_CREATE'),
      hook(2, 'ORDERS_CREATE'),
      hook(3, 'ORDERS_UPDATED'),
      unrelated,
    ]);

    const result = await migrateShopifyWebhooks({ ctx, execute: true, mode: 'remove' });

    expect(result.removedIds).toEqual([gid(1), gid(2), gid(3)]);
    expect(subscriptions).toEqual([unrelated]);
    expect(deleted).toEqual([gid(1), gid(2), gid(3)]);
    expect(requests.filter((operation) => operation === 'ShopkeeperWebhookSubscriptionDelete')).toHaveLength(3);
  });

  it('restores only missing topics and verifies one of each', async () => {
    const existing = hook(1, 'ORDERS_CREATE');
    const unrelated = hook(9, 'PRODUCTS_CREATE');
    const { requests, subscriptions } = fakeShopify([existing, unrelated]);

    const result = await migrateShopifyWebhooks({ ctx, execute: true, mode: 'restore' });

    expect(result.createdTopics).toEqual(SHOPIFY_WEBHOOK_TOPICS.slice(1));
    expect(requests.filter((operation) => operation === 'ShopkeeperWebhookSubscriptionCreate')).toHaveLength(4);
    expect(subscriptions).toContain(existing);
    expect(subscriptions).toContain(unrelated);
    expect(matchingMigrationSubscriptions(subscriptions)).toHaveLength(5);
  });

  it('fails restore verification when an existing topic is duplicated', async () => {
    const { requests } = fakeShopify([
      hook(1, 'ORDERS_CREATE'),
      hook(2, 'ORDERS_CREATE'),
    ]);

    await expect(migrateShopifyWebhooks({ ctx, execute: true, mode: 'restore' }))
      .rejects.toThrow('expected exactly one matching subscription for ORDERS_CREATE');
    expect(requests).not.toContain('ShopkeeperWebhookSubscriptionDelete');
  });
});

function gid(id: number): string {
  return `gid://shopify/WebhookSubscription/${id}`;
}

function hook(
  id: number,
  topic: string,
  uri = SHOPIFY_WEBHOOK_ADDRESS,
): ShopifyWebhookSubscription {
  return { id: gid(id), topic, uri };
}

// Shopify's webhook subscriptions, kept in memory and changed by the mutations.
function fakeShopify(initial: ShopifyWebhookSubscription[]) {
  const subscriptions = [...initial];
  const requests: string[] = [];
  const deleted: string[] = [];
  let nextId = 100;
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
    const request = graphqlRequest(init);
    if (!request) throw new Error('unexpected request');
    requests.push(request.operation);
    if (request.operation === 'ShopkeeperWebhookSubscriptions') {
      return graphqlResponse({ webhookSubscriptions: { nodes: subscriptions } });
    }
    if (request.operation === 'ShopkeeperWebhookSubscriptionDelete') {
      const id = String(request.variables.id);
      const index = subscriptions.findIndex((subscription) => subscription.id === id);
      if (index >= 0) subscriptions.splice(index, 1);
      deleted.push(id);
      return graphqlResponse({ webhookSubscriptionDelete: { deletedWebhookSubscriptionId: id, userErrors: [] } });
    }
    if (request.operation === 'ShopkeeperWebhookSubscriptionCreate') {
      const { uri } = request.variables.webhookSubscription as { uri: string };
      const created = hook(nextId, String(request.variables.topic), uri);
      nextId += 1;
      subscriptions.push(created);
      return graphqlResponse({ webhookSubscriptionCreate: { webhookSubscription: { id: created.id }, userErrors: [] } });
    }
    throw new Error(`unexpected operation ${request.operation}`);
  }));
  return { requests, subscriptions, deleted };
}

