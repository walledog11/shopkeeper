#!/usr/bin/env node
// Reset the dedicated Linen & Loom landing-page fixture in an owned Shopify
// development store. Inspect mode is read-only. --execute deletes only prior
// test orders carrying both fixture ownership markers, then recreates the
// product, inventory, order, and matching Shopkeeper workspace settings.
//
// The normal Shopkeeper integration remains the product path under test. A
// separate setup credential supplies the fixture-only location and write scopes
// solely for the owned development store so they never reach merchant installs.
//
//   npm run landing:media:fixture -- --shop=store.myshopify.com
//   npm run landing:media:fixture -- --execute --shop=store.myshopify.com
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadLocalEnv } from './load-local-env.mjs';
import {
  MEDIA_ORDER_NAME,
  MEDIA_ORDER_TAG,
  MEDIA_PRODUCT_HANDLE,
  SETUP_REQUIRED_SCOPES,
  buildManifest,
  buildOrderCreateInput,
  buildProductSetInput,
  findMediaVariants,
  isDevelopmentStore,
  isOwnedMediaOrder,
  mediaSettings,
  missingScopes,
  normalizeShop,
  readValueArg,
  selectLocation,
} from './landing-media-fixture-lib.mjs';

loadLocalEnv();

const argv = process.argv.slice(2);
const EXECUTE = argv.includes('--execute');
const SHOP = readValueArg(argv, '--shop=');
const INTEGRATION_ID = readValueArg(argv, '--integration-id=');
const LOCATION_ID = readValueArg(argv, '--location-id=');
const MANIFEST_PATH = path.resolve(
  readValueArg(argv, '--manifest=') ?? 'artifacts/landing-media/fixture-manifest.json',
);

if (SHOP && INTEGRATION_ID) throw new Error('Pass only one of --shop or --integration-id.');

const PRODUCT_QUERY = `query LandingMediaProduct($query: String!) {
  products(first: 5, query: $query) {
    nodes {
      id handle title tags
      variants(first: 10) {
        nodes {
          id title price inventoryQuantity
          selectedOptions { name value }
          inventoryItem { id tracked }
        }
      }
    }
  }
}`;

const STORE_QUERY = `query LandingMediaStore {
  shop {
    name myshopifyDomain currencyCode
    plan { partnerDevelopment publicDisplayName }
  }
  currentAppInstallation { accessScopes { handle } }
}`;

const SETUP_STORE_QUERY = `query LandingMediaSetupStore {
  shop {
    name myshopifyDomain currencyCode
    plan { partnerDevelopment publicDisplayName }
  }
  currentAppInstallation { accessScopes { handle } }
  locations(first: 20) { nodes { id name isActive fulfillsOnlineOrders } }
}`;

const ORDERS_QUERY = `query LandingMediaOrders($query: String!) {
  orders(first: 25, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name test tags sourceIdentifier displayFinancialStatus displayFulfillmentStatus
      lineItems(first: 10) { nodes { title variantTitle quantity variant { id } } }
    }
  }
}`;

const PRODUCT_SET_MUTATION = `mutation LandingMediaProductSet(
  $identifier: ProductSetIdentifiers,
  $input: ProductSetInput!,
  $synchronous: Boolean!
) {
  productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
    product {
      id handle title tags
      variants(first: 10) {
        nodes { id title price inventoryQuantity selectedOptions { name value } inventoryItem { id tracked } }
      }
    }
    userErrors { field message }
  }
}`;

const ORDER_DELETE_MUTATION = `mutation LandingMediaOrderDelete($orderId: ID!) {
  orderDelete(orderId: $orderId) {
    deletedId
    userErrors { field message }
  }
}`;

const ORDER_CREATE_MUTATION = `mutation LandingMediaOrderCreate(
  $order: OrderCreateOrderInput!,
  $options: OrderCreateOptionsInput
) {
  orderCreate(order: $order, options: $options) {
    order {
      id name test tags sourceIdentifier displayFinancialStatus displayFulfillmentStatus
      lineItems(first: 10) { nodes { title variantTitle quantity variant { id } } }
      customer { id firstName lastName email }
    }
    userErrors { field message code }
  }
}`;

function describeGraphqlErrors(errors) {
  return errors.map((error) => `${error.message}${error.path ? ` (${error.path.join('.')})` : ''}`).join('; ');
}

async function adminGraphql(ctx, document, variables = {}) {
  const response = await fetch(`https://${normalizeShop(ctx.shop)}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ctx.accessToken,
    },
    body: JSON.stringify({ query: document, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Shopify GraphQL returned ${response.status}.`);
  }
  if (payload?.errors?.length) throw new Error(describeGraphqlErrors(payload.errors));
  if (!payload?.data) throw new Error('Shopify GraphQL returned no data.');
  return payload.data;
}

function throwUserErrors(label, errors) {
  if ((errors ?? []).length === 0) return;
  throw new Error(`${label}: ${errors.map((error) => error.message).join('; ')}`);
}

async function setupAccessToken(shop) {
  if (process.env.LANDING_MEDIA_SHOPIFY_ACCESS_TOKEN) {
    return process.env.LANDING_MEDIA_SHOPIFY_ACCESS_TOKEN;
  }
  const clientId = process.env.LANDING_MEDIA_SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.LANDING_MEDIA_SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Execute mode requires LANDING_MEDIA_SHOPIFY_ACCESS_TOKEN or both '
      + 'LANDING_MEDIA_SHOPIFY_CLIENT_ID and LANDING_MEDIA_SHOPIFY_CLIENT_SECRET.',
    );
  }
  const response = await fetch(`https://${normalizeShop(shop)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Shopify client-credentials exchange failed (${response.status}).`);
  }
  return payload.access_token;
}

async function loadIntegration(db) {
  const rows = await db.integration.findMany({
    where: { platform: 'shopify', lifecycleStatus: 'active' },
    select: {
      id: true,
      organizationId: true,
      externalAccountId: true,
      accessToken: true,
      metadata: true,
      organization: { select: { name: true, settings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const usable = rows.filter((row) => (
    row.accessToken
    && !(row.metadata && typeof row.metadata === 'object' && row.metadata.simulated === true)
  ));
  const matches = INTEGRATION_ID
    ? usable.filter((row) => row.id === INTEGRATION_ID)
    : SHOP
      ? usable.filter((row) => normalizeShop(row.externalAccountId) === normalizeShop(SHOP))
      : usable;
  if (matches.length !== 1) {
    const stores = usable.map((row) => row.externalAccountId).join(', ') || 'none';
    throw new Error(`Expected exactly one usable Shopify integration; found ${matches.length}. Usable stores: ${stores}.`);
  }
  return matches[0];
}

function findMediaProduct(data) {
  const products = data.products?.nodes ?? [];
  if (products.length > 1) throw new Error(`Multiple products matched fixture handle ${MEDIA_PRODUCT_HANDLE}.`);
  return products[0] ?? null;
}

async function readProduct(ctx) {
  const data = await adminGraphql(ctx, PRODUCT_QUERY, {
    query: `handle:${MEDIA_PRODUCT_HANDLE}`,
  });
  return findMediaProduct(data);
}

async function readMediaOrders(ctx) {
  const data = await adminGraphql(ctx, ORDERS_QUERY, {
    query: `tag:${MEDIA_ORDER_TAG} test:true`,
  });
  return (data.orders?.nodes ?? []).filter(isOwnedMediaOrder);
}

async function waitForShopkeeperReadback(ctx, orderId) {
  const attempts = 8;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const [product, orders] = await Promise.all([
      readProduct(ctx),
      readMediaOrders(ctx),
    ]);
    const order = orders.find((candidate) => candidate.id === orderId);
    if (product && order) return { product, order };
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  return null;
}

async function main() {
  const { db } = await import('@shopkeeper/db');
  const integration = await loadIntegration(db);
  const shopkeeperCtx = {
    shop: normalizeShop(integration.externalAccountId),
    accessToken: integration.accessToken,
  };
  const shopkeeperStore = await adminGraphql(shopkeeperCtx, STORE_QUERY);
  const shop = shopkeeperStore.shop;
  if (normalizeShop(shop.myshopifyDomain) !== shopkeeperCtx.shop) {
    throw new Error('The stored Shopify integration token resolves to a different shop.');
  }
  if (!isDevelopmentStore({
    partnerDevelopment: shop.plan?.partnerDevelopment,
    publicDisplayName: shop.plan?.publicDisplayName,
  })) {
    throw new Error(
      `Refusing fixture mutations: ${shop.myshopifyDomain} is on ${shop.plan?.publicDisplayName ?? 'an unknown plan'}, not a development store.`,
    );
  }
  const currentProduct = await readProduct(shopkeeperCtx);
  const currentOrders = await readMediaOrders(shopkeeperCtx);
  const inspection = {
    mode: EXECUTE ? 'execute' : 'inspect',
    store: {
      name: shop.name,
      domain: shop.myshopifyDomain,
      plan: shop.plan?.publicDisplayName ?? null,
      partnerDevelopment: shop.plan?.partnerDevelopment ?? null,
    },
    organization: { id: integration.organizationId, name: integration.organization.name },
    location: null,
    product: currentProduct
      ? { id: currentProduct.id, title: currentProduct.title, handle: currentProduct.handle }
      : null,
    ownedTestOrders: currentOrders.map((order) => ({ id: order.id, name: order.name })),
  };
  if (!EXECUTE) {
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }

  const setupCtx = { shop: shopkeeperCtx.shop, accessToken: await setupAccessToken(shopkeeperCtx.shop) };
  const setupStore = await adminGraphql(setupCtx, SETUP_STORE_QUERY);
  if (normalizeShop(setupStore.shop?.myshopifyDomain) !== shopkeeperCtx.shop) {
    throw new Error('The landing-media setup credential resolves to a different shop than Shopkeeper.');
  }
  if (!isDevelopmentStore({
    partnerDevelopment: setupStore.shop?.plan?.partnerDevelopment,
    publicDisplayName: setupStore.shop?.plan?.publicDisplayName,
  })) {
    throw new Error('The landing-media setup credential is not attached to a development store.');
  }
  const location = selectLocation(setupStore.locations?.nodes ?? [], LOCATION_ID);
  inspection.location = { id: location.id, name: location.name };
  const granted = (setupStore.currentAppInstallation?.accessScopes ?? []).map((scope) => scope.handle);
  const missing = missingScopes(granted);
  if (missing.length > 0) {
    throw new Error(`The landing-media setup credential is missing: ${missing.join(', ')}. Required: ${SETUP_REQUIRED_SCOPES.join(', ')}.`);
  }

  // Delete only test orders that carry both immutable fixture ownership markers.
  // This happens before productSet so existing order references cannot block a
  // reset of the two fixture variants.
  for (const order of await readMediaOrders(setupCtx)) {
    if (!isOwnedMediaOrder(order)) throw new Error(`Refusing to delete unowned order ${order.id}.`);
    const deleted = await adminGraphql(setupCtx, ORDER_DELETE_MUTATION, { orderId: order.id });
    throwUserErrors(`Could not delete fixture order ${order.name ?? order.id}`, deleted.orderDelete?.userErrors);
    if (deleted.orderDelete?.deletedId !== order.id) {
      throw new Error(`Shopify did not confirm deletion of fixture order ${order.id}.`);
    }
  }

  const productData = await adminGraphql(setupCtx, PRODUCT_SET_MUTATION, {
    identifier: { handle: MEDIA_PRODUCT_HANDLE },
    input: buildProductSetInput(currentProduct, location.id),
    synchronous: true,
  });
  throwUserErrors('Could not reset Linen Jumpsuit', productData.productSet?.userErrors);
  const product = productData.productSet?.product;
  if (!product?.id) throw new Error('Shopify returned no product after productSet.');
  const { medium } = findMediaVariants(product);

  const orderData = await adminGraphql(setupCtx, ORDER_CREATE_MUTATION, {
    order: buildOrderCreateInput(medium.id),
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  });
  throwUserErrors('Could not create media test order', orderData.orderCreate?.userErrors);
  const order = orderData.orderCreate?.order;
  if (!order?.id || !isOwnedMediaOrder(order)) {
    throw new Error('Shopify did not return the expected owned test order.');
  }
  if (order.name !== MEDIA_ORDER_NAME) {
    throw new Error(`Shopify created ${order.name ?? 'an unnamed order'} instead of ${MEDIA_ORDER_NAME}.`);
  }

  const nextSettings = mediaSettings(integration.organization.settings);
  await db.organization.update({
    where: { id: integration.organizationId },
    data: { name: 'Linen & Loom', settings: nextSettings },
  });
  let knowledgeBase = await db.knowledgeBase.findFirst({
    where: { organizationId: integration.organizationId, name: 'Landing media fixture', source: 'user' },
  });
  if (!knowledgeBase) {
    knowledgeBase = await db.knowledgeBase.create({
      data: { organizationId: integration.organizationId, name: 'Landing media fixture', source: 'user' },
    });
  }
  const policyTitle = 'Unfulfilled same-price size swaps';
  const existingArticle = await db.kbArticle.findFirst({
    where: { organizationId: integration.organizationId, knowledgeBaseId: knowledgeBase.id, title: policyTitle },
  });
  const policyData = {
    body: 'Unfulfilled orders may swap size when the replacement is in stock and the price is unchanged. Ask the merchant before changing the order.',
    tags: ['Order Status', 'Returns'],
  };
  if (existingArticle) {
    await db.kbArticle.update({ where: { id: existingArticle.id }, data: policyData });
  } else {
    await db.kbArticle.create({
      data: {
        organizationId: integration.organizationId,
        knowledgeBaseId: knowledgeBase.id,
        title: policyTitle,
        ...policyData,
      },
    });
  }

  // Read back through Shopkeeper's ordinary integration, not the setup app.
  const verified = await waitForShopkeeperReadback(shopkeeperCtx, order.id);
  if (!verified) {
    throw new Error('The fixture was created, but Shopkeeper could not read it back through its normal integration.');
  }
  const manifest = buildManifest({
    shop: shopkeeperCtx.shop,
    organizationId: integration.organizationId,
    integrationId: integration.id,
    location,
    product: verified.product,
    order: verified.order,
  });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...inspection, result: manifest, manifestPath: MANIFEST_PATH }, null, 2));
}

await main();
