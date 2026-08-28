import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@shopkeeper/agent/testing';
import {
  matchingMigrationSubscriptions,
  migrateShopifyWebhooks,
  missingMigrationTopics,
  parseShopifyWebhookMigrationArgs,
  SHOPIFY_WEBHOOK_ADDRESS,
  SHOPIFY_WEBHOOK_TOPICS,
  type ShopifyWebhookSubscription,
} from './inspect-shopify-webhooks.js';

describe('Shopify webhook migration selection', () => {
  it('selects only the five exact topics at the exact gateway address', () => {
    const subscriptions = [
      hook(1, 'orders/create'),
      hook(2, 'orders/create', 'https://unrelated.example/webhooks/shopify'),
      hook(3, 'products/create'),
    ];

    expect(matchingMigrationSubscriptions(subscriptions).map(({ id }) => id)).toEqual([1]);
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
    const { fetchImpl, requests } = fakeShopify([hook(1, 'orders/create')]);

    const result = await migrateShopifyWebhooks({
      accessToken: 'token',
      execute: false,
      fetchImpl,
      mode: 'audit',
      shop: 'fixture.myshopify.com',
    });

    expect(result.before).toHaveLength(1);
    expect(requests).toEqual([{ method: 'GET', path: 'webhooks.json?limit=250' }]);
  });

  it('does not issue any request when remove lacks execute', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(migrateShopifyWebhooks({
      accessToken: 'token',
      execute: false,
      fetchImpl,
      mode: 'remove',
      shop: 'fixture.myshopify.com',
    })).rejects.toThrow('remove requires --execute.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('removes duplicate matches without touching unrelated subscriptions', async () => {
    const unrelated = hook(9, 'orders/create', 'https://unrelated.example/hook');
    const { fetchImpl, requests, subscriptions } = fakeShopify([
      hook(1, 'orders/create'),
      hook(2, 'orders/create'),
      hook(3, 'orders/updated'),
      unrelated,
    ]);

    const result = await migrateShopifyWebhooks({
      accessToken: 'token',
      execute: true,
      fetchImpl,
      mode: 'remove',
      shop: 'fixture.myshopify.com',
    });

    expect(result.removedIds).toEqual([1, 2, 3]);
    expect(subscriptions).toEqual([unrelated]);
    expect(requests.filter(({ method }) => method === 'DELETE').map(({ path }) => path))
      .toEqual(['webhooks/1.json', 'webhooks/2.json', 'webhooks/3.json']);
  });

  it('restores only missing topics and verifies one of each', async () => {
    const existing = hook(1, 'orders/create');
    const unrelated = hook(9, 'products/create');
    const { fetchImpl, requests, subscriptions } = fakeShopify([existing, unrelated]);

    const result = await migrateShopifyWebhooks({
      accessToken: 'token',
      execute: true,
      fetchImpl,
      mode: 'restore',
      shop: 'fixture.myshopify.com',
    });

    expect(result.createdTopics).toEqual(SHOPIFY_WEBHOOK_TOPICS.slice(1));
    expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(4);
    expect(subscriptions).toContain(existing);
    expect(subscriptions).toContain(unrelated);
    expect(matchingMigrationSubscriptions(subscriptions)).toHaveLength(5);
  });

  it('fails restore verification when an existing topic is duplicated', async () => {
    const { fetchImpl, requests } = fakeShopify([
      hook(1, 'orders/create'),
      hook(2, 'orders/create'),
    ]);

    await expect(migrateShopifyWebhooks({
      accessToken: 'token',
      execute: true,
      fetchImpl,
      mode: 'restore',
      shop: 'fixture.myshopify.com',
    })).rejects.toThrow('expected exactly one matching subscription for orders/create');
    expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  });
});

function hook(
  id: number,
  topic: string,
  address = SHOPIFY_WEBHOOK_ADDRESS,
): ShopifyWebhookSubscription {
  return { id, topic, address };
}

function fakeShopify(initial: ShopifyWebhookSubscription[]) {
  const subscriptions = [...initial];
  const requests: Array<{ method: string; path: string }> = [];
  let nextId = 100;
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const marker = '/admin/api/2026-04/';
    const path = url.pathname.slice(url.pathname.indexOf(marker) + marker.length) + url.search;
    const method = init?.method ?? 'GET';
    requests.push({ method, path });

    if (method === 'GET') return jsonResponse({ webhooks: subscriptions });
    if (method === 'DELETE') {
      const id = Number.parseInt(path.match(/^webhooks\/(\d+)\.json$/)?.[1] ?? '', 10);
      const index = subscriptions.findIndex((subscription) => subscription.id === id);
      if (index >= 0) subscriptions.splice(index, 1);
      return new Response(null, { status: 200 });
    }
    if (method === 'POST') {
      const payload = JSON.parse(String(init?.body)) as {
        webhook: { topic: string; address: string };
      };
      const created = hook(nextId, payload.webhook.topic, payload.webhook.address);
      nextId += 1;
      subscriptions.push(created);
      return jsonResponse({ webhook: created }, { status: 201 });
    }
    return jsonResponse({ error: 'unexpected request' }, { status: 500 });
  });
  return { fetchImpl, requests, subscriptions };
}

