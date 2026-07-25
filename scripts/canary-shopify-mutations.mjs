#!/usr/bin/env node
// P3-01 Shopify mutation canary harness.
//
// Default mode is inspect-only: classify the connected store and refuse
// mutations unless the store is a known development plan or --allow-live-store
// is explicitly passed.
//
// The store is never chosen implicitly: simulated fixtures and rows whose token
// cannot be decrypted in this environment are skipped, and anything short of a
// single remaining candidate requires --shop.
//
//   node scripts/canary-shopify-mutations.mjs
//   node scripts/canary-shopify-mutations.mjs --shop=example.myshopify.com
//   node scripts/canary-shopify-mutations.mjs --execute --only=gift_card,refund
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const {
  shopifyRestJson,
  createGiftCard,
  createRefund,
  createShopifyOrder,
  probeUnknownShopifyMutation,
} = await import('@shopkeeper/agent/shopify');

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has('--execute');
const ALLOW_LIVE_STORE = args.has('--allow-live-store');
const ONLY = readCsvArg('--only=');
const SHOP = readValueArg('--shop=');

const DEVELOPMENT_PLANS = new Set([
  'partner_test',
  'affiliate',
  'staff',
  'staff_business',
  'trial',
  'plus_partner_sandbox',
  'shopify_alumni',
]);

function readValueArg(prefix) {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  return raw || null;
}

function readCsvArg(prefix) {
  const raw = readValueArg(prefix);
  if (!raw) return null;
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function shouldRun(family) {
  return !ONLY || ONLY.includes(family);
}

function isSimulated(metadata) {
  return Boolean(
    metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && metadata.simulated === true,
  );
}

function normalizeShop(value) {
  return value.trim().toLowerCase().replace(/\.myshopify\.com$/, '');
}

async function loadShopifyIntegration() {
  const rows = await db.integration.findMany({
    where: { platform: 'shopify' },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      accessToken: true,
      metadata: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const skipped = [];
  const candidates = [];
  for (const row of rows) {
    const shop = row.externalAccountId;
    if (!shop) {
      skipped.push({ shop: null, reason: 'no shop domain recorded' });
    } else if (isSimulated(row.metadata)) {
      skipped.push({ shop, reason: 'simulated fixture' });
    } else if (!row.accessToken) {
      // accessToken is decrypted on read, so a null here means either no stored
      // token or one this environment's TOKEN_ENCRYPTION_KEY cannot decrypt.
      skipped.push({ shop, reason: 'token absent or not decryptable with this TOKEN_ENCRYPTION_KEY' });
    } else {
      candidates.push(row);
    }
  }

  const matches = SHOP
    ? candidates.filter((row) => normalizeShop(row.externalAccountId) === normalizeShop(SHOP))
    : candidates;

  if (matches.length !== 1) {
    const available = candidates.map((row) => row.externalAccountId).join(', ') || 'none';
    const detail = skipped.length > 0
      ? ` Skipped: ${skipped.map((entry) => `${entry.shop ?? 'unknown'} (${entry.reason})`).join('; ')}.`
      : '';
    if (matches.length === 0) {
      throw new Error(
        `${SHOP ? `No usable Shopify integration matched --shop=${SHOP}.` : 'No usable Shopify integration was found.'}`
        + ` Usable: ${available}.${detail}`,
      );
    }
    throw new Error(
      `${matches.length} usable Shopify integrations found; pass --shop=<domain> to choose one. Usable: ${available}.${detail}`,
    );
  }

  const integration = matches[0];
  return {
    organizationId: integration.organizationId,
    integrationId: integration.id,
    skipped,
    ctx: {
      shop: integration.externalAccountId,
      accessToken: integration.accessToken,
    },
  };
}

async function inspectStore(ctx) {
  try {
    const [shopData, ordersData] = await Promise.all([
      shopifyRestJson(ctx, 'shop.json', { query: { fields: 'name,plan_name,domain,email,currency' } }),
      shopifyRestJson(ctx, 'orders.json', {
        query: {
          status: 'any',
          limit: 10,
          fields: 'id,name,test,financial_status,cancelled_at,total_price',
        },
      }),
    ]);

    const shop = shopData.shop;
    const orders = ordersData.orders ?? [];
    const testOrders = orders.filter((order) => order.test === true);
    const liveOrders = orders.filter((order) => order.test !== true);
    const planName = String(shop?.plan_name ?? 'unknown');
    const isDevelopmentPlan = DEVELOPMENT_PLANS.has(planName.toLowerCase());
    const mutationsAllowed = isDevelopmentPlan || ALLOW_LIVE_STORE;

    return {
      shop: {
        fingerprint: fingerprint(ctx.shop),
        name: shop?.name ?? null,
        planName,
        domain: shop?.domain ?? null,
        currency: shop?.currency ?? null,
        isDevelopmentPlan,
        mutationsAllowed,
      },
      recentOrders: {
        totalSampled: orders.length,
        testCount: testOrders.length,
        liveCount: liveOrders.length,
        candidateTestOrderId: testOrders[0]?.id ? String(testOrders[0].id) : null,
      },
      connectivityError: null,
    };
  } catch (error) {
    return {
      shop: {
        fingerprint: fingerprint(ctx.shop),
        name: null,
        planName: null,
        domain: null,
        currency: null,
        isDevelopmentPlan: false,
        mutationsAllowed: false,
      },
      recentOrders: {
        totalSampled: 0,
        testCount: 0,
        liveCount: 0,
        candidateTestOrderId: null,
      },
      connectivityError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runFamily(family, runner) {
  const startedAt = Date.now();
  try {
    const result = await runner();
    return {
      family,
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    };
  } catch (error) {
    return {
      family,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCanaries(ctx, inspection) {
  const results = [];
  const operationBase = `canary:${randomUUID()}`;

  if (shouldRun('gift_card') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('gift_card', async () => {
      const operationId = `${operationBase}:gift_card`;
      const input = { amount: '1.00', reason: 'Shopkeeper mutation canary' };
      const result = await createGiftCard(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('create_gift_card', input, { ...ctx, operationId });
      return { status: result.status, probeOutcome: probe.outcome };
    }));
  }

  const testOrderId = inspection.recentOrders.candidateTestOrderId;
  if (shouldRun('refund') && inspection.shop.mutationsAllowed && testOrderId) {
    results.push(await runFamily('refund', async () => {
      const operationId = `${operationBase}:refund`;
      const input = { order_id: testOrderId, amount: '0.01', reason: 'Shopkeeper mutation canary' };
      const result = await createRefund(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('create_refund', input, { ...ctx, operationId });
      return { status: result.status, probeOutcome: probe.outcome };
    }));
  }

  if (shouldRun('order_creation') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('order_creation', async () => {
      const operationId = `${operationBase}:create_order`;
      const email = `shopkeeper-canary+${Date.now()}@example.com`;
      const input = {
        email,
        first_name: 'Canary',
        last_name: 'Shopkeeper',
        address1: '1 Test St',
        city: 'Portland',
        province: 'OR',
        zip: '97201',
        country: 'US',
        line_items: [{ title: 'Canary line item', price: '1.00', quantity: 1 }],
      };
      const result = await createShopifyOrder(input, { ...ctx, operationId }, { allowCustomLineItems: true });
      const probe = await probeUnknownShopifyMutation('create_shopify_order', { email }, { ...ctx, operationId });
      return { status: result.status, probeOutcome: probe.outcome };
    }));
  }

  return results;
}

const { organizationId, integrationId, skipped, ctx } = await loadShopifyIntegration();
const inspection = await inspectStore(ctx);

const report = {
  mode: EXECUTE ? 'execute' : 'inspect',
  organizationFingerprint: fingerprint(organizationId),
  integrationFingerprint: fingerprint(integrationId),
  selectedShop: ctx.shop,
  skippedIntegrations: skipped,
  inspection,
  canaries: EXECUTE ? await runCanaries(ctx, inspection) : [],
  notes: [],
};

if (inspection.connectivityError) {
  report.notes.push(`Shopify connectivity failed: ${inspection.connectivityError}`);
}
if (!inspection.shop.mutationsAllowed) {
  report.notes.push(
    'Mutations refused: connected store is not a known development plan. Re-run with --allow-live-store only after explicit operator approval.',
  );
}
if (EXECUTE && !inspection.shop.mutationsAllowed) {
  report.notes.push('No canaries were executed.');
}
if (EXECUTE && inspection.shop.mutationsAllowed && shouldRun('refund') && !inspection.recentOrders.candidateTestOrderId) {
  report.notes.push('Refund canary skipped: no recent test order was found.');
}

console.log(JSON.stringify(report, null, 2));

const failed = report.canaries.filter((entry) => !entry.ok || entry.status === 'error');
if (EXECUTE && failed.length > 0) {
  process.exitCode = 1;
}

await db.$disconnect();
