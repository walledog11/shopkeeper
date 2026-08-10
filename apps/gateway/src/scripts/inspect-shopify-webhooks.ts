import { pathToFileURL } from 'node:url';
import { loadGatewayEnv } from '../config/load-env.js';

export const SHOPIFY_WEBHOOK_API_VERSION = '2026-04';
export const SHOPIFY_WEBHOOK_ADDRESS =
  'https://clerk-production-e37f.up.railway.app/webhooks/shopify';
export const SHOPIFY_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/fulfilled',
  'orders/updated',
  'orders/cancelled',
  'app/uninstalled',
] as const;

type MigrationMode = 'audit' | 'remove' | 'restore';
type MigrationTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

export interface ShopifyWebhookSubscription {
  id: number;
  topic: string;
  address: string;
  created_at?: string;
  updated_at?: string;
  api_version?: string;
}

export interface ShopifyWebhookMigrationOptions {
  accessToken: string;
  execute: boolean;
  fetchImpl?: typeof fetch;
  mode: MigrationMode;
  shop: string;
}

export interface ShopifyWebhookMigrationResult {
  after: ShopifyWebhookSubscription[];
  before: ShopifyWebhookSubscription[];
  createdTopics: MigrationTopic[];
  removedIds: number[];
}

export function matchingMigrationSubscriptions(
  subscriptions: readonly ShopifyWebhookSubscription[],
): ShopifyWebhookSubscription[] {
  const topics = new Set<string>(SHOPIFY_WEBHOOK_TOPICS);
  return subscriptions.filter(
    (subscription) => topics.has(subscription.topic)
      && subscription.address === SHOPIFY_WEBHOOK_ADDRESS,
  );
}

export function missingMigrationTopics(
  subscriptions: readonly ShopifyWebhookSubscription[],
): MigrationTopic[] {
  const existingTopics = new Set(
    matchingMigrationSubscriptions(subscriptions).map((subscription) => subscription.topic),
  );
  return SHOPIFY_WEBHOOK_TOPICS.filter((topic) => !existingTopics.has(topic));
}

export function parseShopifyWebhookMigrationArgs(argv: readonly string[]): {
  execute: boolean;
  mode: MigrationMode;
  shop?: string;
} {
  let mode: MigrationMode = 'audit';
  let modeSet = false;
  let execute = false;
  let shop: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === 'audit' || argument === 'remove' || argument === 'restore') {
      if (modeSet) throw new Error('Specify only one mode: audit, remove, or restore.');
      mode = argument;
      modeSet = true;
      continue;
    }
    if (argument === '--execute') {
      execute = true;
      continue;
    }
    if (argument === '--shop') {
      shop = argv[index + 1];
      index += 1;
      if (!shop) throw new Error('--shop requires a myshopify.com domain.');
      continue;
    }
    if (argument.startsWith('--shop=')) {
      shop = argument.slice('--shop='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (shop) shop = normalizeShopDomain(shop);
  if ((mode === 'remove' || mode === 'restore') && (!shop || !execute)) {
    throw new Error(`${mode} requires an explicit --shop <domain> and --execute.`);
  }
  if (mode === 'audit' && execute) {
    throw new Error('audit is always read-only; omit --execute.');
  }
  return { execute, mode, ...(shop && { shop }) };
}

export async function migrateShopifyWebhooks({
  accessToken,
  execute,
  fetchImpl = fetch,
  mode,
  shop,
}: ShopifyWebhookMigrationOptions): Promise<ShopifyWebhookMigrationResult> {
  if ((mode === 'remove' || mode === 'restore') && !execute) {
    throw new Error(`${mode} requires --execute.`);
  }

  const before = await listShopifyWebhooks(fetchImpl, shop, accessToken);
  const removedIds: number[] = [];
  const createdTopics: MigrationTopic[] = [];

  if (mode === 'remove') {
    for (const subscription of matchingMigrationSubscriptions(before)) {
      await requestShopify(fetchImpl, shop, accessToken, `webhooks/${subscription.id}.json`, {
        method: 'DELETE',
      });
      removedIds.push(subscription.id);
    }
  }

  if (mode === 'restore') {
    for (const topic of missingMigrationTopics(before)) {
      await requestShopify(fetchImpl, shop, accessToken, 'webhooks.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: { topic, address: SHOPIFY_WEBHOOK_ADDRESS, format: 'json' },
        }),
      });
      createdTopics.push(topic);
    }
  }

  const after = mode === 'audit'
    ? before
    : await listShopifyWebhooks(fetchImpl, shop, accessToken);
  verifyMigrationResult(mode, after);
  return { after, before, createdTopics, removedIds };
}

function verifyMigrationResult(
  mode: MigrationMode,
  subscriptions: readonly ShopifyWebhookSubscription[],
): void {
  if (mode === 'audit') return;
  const matching = matchingMigrationSubscriptions(subscriptions);
  if (mode === 'remove') {
    if (matching.length > 0) {
      throw new Error(`Removal verification failed: ${matching.length} matching subscriptions remain.`);
    }
    return;
  }

  const counts = new Map<string, number>();
  for (const subscription of matching) {
    counts.set(subscription.topic, (counts.get(subscription.topic) ?? 0) + 1);
  }
  const invalid = SHOPIFY_WEBHOOK_TOPICS.filter((topic) => counts.get(topic) !== 1);
  if (invalid.length > 0) {
    throw new Error(
      `Restore verification failed: expected exactly one matching subscription for ${invalid.join(', ')}.`,
    );
  }
}

async function listShopifyWebhooks(
  fetchImpl: typeof fetch,
  shop: string,
  accessToken: string,
): Promise<ShopifyWebhookSubscription[]> {
  const response = await requestShopify(
    fetchImpl,
    shop,
    accessToken,
    'webhooks.json?limit=250',
  );
  const payload = await response.json() as { webhooks?: unknown };
  if (!Array.isArray(payload.webhooks)) {
    throw new Error(`Shopify returned a malformed webhook list for ${shop}.`);
  }
  return payload.webhooks.filter(isWebhookSubscription);
}

async function requestShopify(
  fetchImpl: typeof fetch,
  shop: string,
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetchImpl(
    `https://${shop}/admin/api/${SHOPIFY_WEBHOOK_API_VERSION}/${path}`,
    {
      ...init,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        ...init.headers,
      },
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Shopify webhooks request failed (${response.status}): ${detail}`);
  }
  return response;
}

function isWebhookSubscription(value: unknown): value is ShopifyWebhookSubscription {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'number'
    && typeof row.topic === 'string'
    && typeof row.address === 'string';
}

function normalizeShopDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)) {
    throw new Error(`Invalid Shopify shop domain: ${value}`);
  }
  return normalized;
}

async function main(): Promise<void> {
  const args = parseShopifyWebhookMigrationArgs(process.argv.slice(2));
  loadGatewayEnv();
  const { db } = await import('@shopkeeper/db');
  const integrations = await db.integration.findMany({
    where: {
      platform: 'shopify',
      ...(args.shop && { externalAccountId: args.shop }),
    },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      accessToken: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (args.shop && integrations.length === 0) {
    throw new Error(`No Shopify integration found for ${args.shop}.`);
  }
  console.log(`Shopify webhook migration mode=${args.mode} integrations=${integrations.length}`);

  for (const row of integrations) {
    console.log(
      `shop=${row.externalAccountId} org=${row.organizationId} (${row.organization?.name ?? '?'}) integration=${row.id}`,
    );
    if (!row.accessToken || !row.externalAccountId) {
      console.log('  skipped: missing access token or shop domain');
      continue;
    }
    const result = await migrateShopifyWebhooks({
      accessToken: row.accessToken,
      execute: args.execute,
      mode: args.mode,
      shop: row.externalAccountId,
    });
    const matchingBefore = matchingMigrationSubscriptions(result.before);
    console.log(
      `  total=${result.before.length} matching=${matchingBefore.length} removed=${result.removedIds.length} restored=${result.createdTopics.length}`,
    );
    for (const subscription of matchingBefore) {
      console.log(
        `  match id=${subscription.id} topic=${subscription.topic} address=${subscription.address}`,
      );
    }
  }

  await db.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
