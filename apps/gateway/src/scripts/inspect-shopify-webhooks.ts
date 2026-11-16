import { pathToFileURL } from 'node:url';
import { shopifyGraphql, type ShopifyContext } from '@shopkeeper/agent/shopify';
import { loadGatewayEnv } from '../config/load-env.js';

export const SHOPIFY_WEBHOOK_ADDRESS =
  'https://clerk-production-e37f.up.railway.app/webhooks/shopify';
export const SHOPIFY_WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'ORDERS_FULFILLED',
  'ORDERS_UPDATED',
  'ORDERS_CANCELLED',
  'APP_UNINSTALLED',
] as const;

type MigrationMode = 'audit' | 'remove' | 'restore';
type MigrationTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

export interface ShopifyWebhookSubscription {
  id: string;
  topic: string;
  uri: string;
}

export interface ShopifyWebhookMigrationOptions {
  ctx: ShopifyContext;
  execute: boolean;
  mode: MigrationMode;
}

export interface ShopifyWebhookMigrationResult {
  after: ShopifyWebhookSubscription[];
  before: ShopifyWebhookSubscription[];
  createdTopics: MigrationTopic[];
  removedIds: string[];
}

const WEBHOOK_SUBSCRIPTIONS_QUERY = `query ShopkeeperWebhookSubscriptions {
  webhookSubscriptions(first: 250) {
    nodes { id topic uri }
  }
}`;

const WEBHOOK_SUBSCRIPTION_DELETE_MUTATION = `mutation ShopkeeperWebhookSubscriptionDelete($id: ID!) {
  webhookSubscriptionDelete(id: $id) {
    deletedWebhookSubscriptionId
    userErrors { field message }
  }
}`;

const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `mutation ShopkeeperWebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

interface UserError { message: string }

export function matchingMigrationSubscriptions(
  subscriptions: readonly ShopifyWebhookSubscription[],
): ShopifyWebhookSubscription[] {
  const topics = new Set<string>(SHOPIFY_WEBHOOK_TOPICS);
  return subscriptions.filter(
    (subscription) => topics.has(subscription.topic)
      && subscription.uri === SHOPIFY_WEBHOOK_ADDRESS,
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
  ctx,
  execute,
  mode,
}: ShopifyWebhookMigrationOptions): Promise<ShopifyWebhookMigrationResult> {
  if ((mode === 'remove' || mode === 'restore') && !execute) {
    throw new Error(`${mode} requires --execute.`);
  }

  const before = await listShopifyWebhooks(ctx);
  const removedIds: string[] = [];
  const createdTopics: MigrationTopic[] = [];

  if (mode === 'remove') {
    for (const subscription of matchingMigrationSubscriptions(before)) {
      const data = await shopifyGraphql<{
        webhookSubscriptionDelete: { deletedWebhookSubscriptionId: string | null; userErrors: UserError[] };
      }>(ctx, WEBHOOK_SUBSCRIPTION_DELETE_MUTATION, { id: subscription.id });
      refuseOnUserErrors(`removing ${subscription.topic}`, data.webhookSubscriptionDelete.userErrors);
      removedIds.push(subscription.id);
    }
  }

  if (mode === 'restore') {
    for (const topic of missingMigrationTopics(before)) {
      const data = await shopifyGraphql<{
        webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: UserError[] };
      }>(ctx, WEBHOOK_SUBSCRIPTION_CREATE_MUTATION, {
        topic,
        webhookSubscription: { uri: SHOPIFY_WEBHOOK_ADDRESS, format: 'JSON' },
      });
      refuseOnUserErrors(`restoring ${topic}`, data.webhookSubscriptionCreate.userErrors);
      createdTopics.push(topic);
    }
  }

  const after = mode === 'audit'
    ? before
    : await listShopifyWebhooks(ctx);
  verifyMigrationResult(mode, after);
  return { after, before, createdTopics, removedIds };
}

function refuseOnUserErrors(action: string, userErrors: readonly UserError[]): void {
  if (userErrors.length > 0) {
    throw new Error(`Shopify refused ${action}: ${userErrors.map((error) => error.message).join(', ')}`);
  }
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

async function listShopifyWebhooks(ctx: ShopifyContext): Promise<ShopifyWebhookSubscription[]> {
  const data = await shopifyGraphql<{ webhookSubscriptions: { nodes: ShopifyWebhookSubscription[] } }>(
    ctx,
    WEBHOOK_SUBSCRIPTIONS_QUERY,
    {},
    { maxRetries: 1 },
  );
  return data.webhookSubscriptions.nodes;
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
  const { SHOPIFY_ACCESS_SELECT, shopifyContextFor } = await import('@shopkeeper/agent/shopify/access');
  const integrations = await db.integration.findMany({
    where: {
      platform: 'shopify',
      ...(args.shop && { externalAccountId: args.shop }),
    },
    select: {
      ...SHOPIFY_ACCESS_SELECT,
      organizationId: true,
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
    const shopify = await shopifyContextFor(row);
    if (!shopify) {
      console.log('  skipped: no usable access token (missing, or the store must be reconnected)');
      continue;
    }
    const result = await migrateShopifyWebhooks({
      ctx: shopify,
      execute: args.execute,
      mode: args.mode,
    });
    const matchingBefore = matchingMigrationSubscriptions(result.before);
    console.log(
      `  total=${result.before.length} matching=${matchingBefore.length} removed=${result.removedIds.length} restored=${result.createdTopics.length}`,
    );
    for (const subscription of matchingBefore) {
      console.log(
        `  match id=${subscription.id} topic=${subscription.topic} uri=${subscription.uri}`,
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
