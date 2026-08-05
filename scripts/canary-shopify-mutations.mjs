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
//   node scripts/canary-shopify-mutations.mjs --integration-id=<uuid>
//   node scripts/canary-shopify-mutations.mjs --execute --only=gift_card,refund
//   node scripts/canary-shopify-mutations.mjs --execute --test-orders-only --only=cancel_order
//   node scripts/canary-shopify-mutations.mjs --validate
//
// --validate checks two document classes against the live schema: mutations, via
// @skip(if: true) so nothing executes, and queries, sent as-is because a read
// against a nonexistent id commits nothing.
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const {
  parseNextPageInfo,
  shopifyGraphql,
  shopifyRest,
  shopifyRestJson,
  attachReturnLabel,
  cancelOrder,
  createExchange,
  createGiftCard,
  createRefund,
  createReturn,
  createShopifyOrder,
  editShopifyOrder,
  fetchFulfillableFulfillmentOrders,
  fetchReturnableLineItems,
  fulfillOrder,
  issueDiscount,
  issueStoreCredit,
  OPEN_RETURN_STATUSES,
  probeUnknownShopifyMutation,
  SHOPIFY_MUTATION_DOCUMENTS,
  SHOPIFY_QUERY_DOCUMENTS,
  skippedMutationDocument,
  updateShopifyOrderAddress,
} = await import('@shopkeeper/agent/shopify');
const { missingShopifyScopes } = await import('@shopkeeper/agent/shopify/integration-health');

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has('--execute');
const VALIDATE = args.has('--validate');
const ALLOW_LIVE_STORE = args.has('--allow-live-store');
const TEST_ORDERS_ONLY = args.has('--test-orders-only');
const ONLY = readCsvArg('--only=');
const SHOP = readValueArg('--shop=');
const INTEGRATION_ID = readValueArg('--integration-id=');
const RECONCILE_GIFT_CARD_CODE = readValueArg('--reconcile-gift-card-code=');

if (SHOP && INTEGRATION_ID) {
  throw new Error('Pass only one of --shop or --integration-id.');
}
if (
  RECONCILE_GIFT_CARD_CODE
  && (EXECUTE || VALIDATE || ONLY || !/^[a-z0-9]{20}$/i.test(RECONCILE_GIFT_CARD_CODE))
) {
  throw new Error(
    '--reconcile-gift-card-code requires a 20-character code and cannot be combined with --execute, --validate, or --only.',
  );
}

const TEST_ORDER_ONLY_FAMILIES = new Set([
  'cancel_order',
  'edit_shopify_order',
  'update_shopify_order_address',
  'return_label',
  'fulfill_order',
  'order_risk_fixture',
]);

if (
  TEST_ORDERS_ONLY
  && (
    !EXECUTE
    || !ONLY
    || ONLY.some((family) => !TEST_ORDER_ONLY_FAMILIES.has(family))
  )
) {
  throw new Error(
    '--test-orders-only requires --execute and an explicit --only list containing only '
    + [...TEST_ORDER_ONLY_FAMILIES].join(', '),
  );
}

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

// ShopifyRequestError carries the actual GraphQL error text on `payload`; its
// `message` is a fixed string. Reporting only the message is what made an
// earlier canary run unreadable.
function describeError(error) {
  if (error && typeof error === 'object' && 'payload' in error && error.payload !== undefined) {
    const payload = typeof error.payload === 'string' ? error.payload : JSON.stringify(error.payload);
    return `${error.message} - ${payload}`;
  }
  return error instanceof Error ? error.message : String(error);
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

// Deliberately the same string parse as the agent's moneyToCents rather than
// float math: this comparison decides the run's exit code, so the two must not
// be able to disagree by a rounding cent.
function moneyToCents(value) {
  if (value === null || value === undefined) return null;
  const [dollars, cents = ''] = String(value).split('.');
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, '0').slice(0, 2));
  return Number.isFinite(total) ? total : null;
}

// The full-refund branch needs an order nothing has refunded yet. `paid`
// excludes the partially refunded ones - including whatever the partial canary
// already touched - and that also keeps the reconciliation probe readable: with
// no requested amount it matches every successful refund on the order, so a
// second one would report `unknown` for a run that actually worked.
function isFullRefundCandidate(order) {
  return !order.cancelled_at
    && String(order.financial_status ?? '').toLowerCase() === 'paid';
}

function selectFullRefundOrder(inspection) {
  // Avoid the partial family's order only when that family is running in this
  // same invocation and will therefore dirty it first. Excluding it
  // unconditionally strands the common case: the newest test order is both the
  // partial family's default pick and the only clean full-refund candidate.
  const conflictOrderId = shouldRun('refund')
    ? inspection.recentOrders.candidateTestOrderId
    : null;
  return inspection.recentOrders.fullRefundCandidates
    .find((order) => order.id !== conflictOrderId) ?? null;
}

async function findRefundableTestOrder(ctx, testOrders) {
  for (const order of testOrders.filter(isFullRefundCandidate)) {
    try {
      const orderId = String(order.id);
      const orderData = await shopifyRestJson(ctx, `orders/${orderId}.json`, {
        query: { fields: 'id,line_items' },
      });
      const refundLineItems = (orderData.order?.line_items ?? []).flatMap((lineItem) => {
        const quantity = Number(lineItem.current_quantity ?? lineItem.quantity ?? 0);
        return lineItem.id != null && quantity > 0
          ? [{ line_item_id: lineItem.id, quantity, restock_type: 'no_restock' }]
          : [];
      });
      const calculation = await shopifyRestJson(ctx, `orders/${orderId}/refunds/calculate.json`, {
        method: 'POST',
        body: {
          refund: {
            shipping: { full_refund: true },
            refund_line_items: refundLineItems,
          },
        },
      });
      const transactions = calculation.refund?.transactions
        ?? calculation.refund?.suggested_transactions
        ?? [];
      if (transactions.some((transaction) => (
        moneyToCents(transaction.maximum_refundable ?? transaction.amount) >= 1
      ))) {
        return order;
      }
    } catch {
      // Eligibility is advisory. The mutation retains its own validation and
      // reconciliation, so an unreadable candidate is safer to skip.
    }
  }
  return null;
}

async function reconcileGiftCardCode(ctx, code) {
  const data = await shopifyGraphql(ctx, `query RecentGiftCardCanaries {
    giftCards(first: 50, sortKey: CREATED_AT, reverse: true) {
      nodes { id initialValue { amount } note lastCharacters }
    }
  }`, {}, { maxRetries: 1 });
  const normalizedCode = code.toLowerCase();
  const matches = (data.giftCards?.nodes ?? []).filter((card) => (
    card.id
    && moneyToCents(card.initialValue?.amount ?? '0') === 100
    && card.note?.includes(`Shopkeeper operation: ${normalizedCode}`)
    && card.lastCharacters?.toLowerCase() === normalizedCode.slice(-4)
  ));
  return {
    outcome: matches.length === 1 ? 'committed' : matches.length > 1 ? 'ambiguous' : 'not_found',
    matches: matches.length,
    amountCents: matches.length === 1 ? moneyToCents(matches[0].initialValue?.amount ?? '0') : null,
  };
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

  const matches = INTEGRATION_ID
    ? candidates.filter((row) => row.id === INTEGRATION_ID)
    : SHOP
      ? candidates.filter((row) => normalizeShop(row.externalAccountId) === normalizeShop(SHOP))
      : candidates;

  if (matches.length !== 1) {
    const available = candidates.map((row) => row.externalAccountId).join(', ') || 'none';
    const detail = skipped.length > 0
      ? ` Skipped: ${skipped.map((entry) => `${entry.shop ?? 'unknown'} (${entry.reason})`).join('; ')}.`
      : '';
    if (matches.length === 0) {
      throw new Error(
        `${INTEGRATION_ID
          ? `No usable Shopify integration matched --integration-id=${INTEGRATION_ID}.`
          : SHOP
            ? `No usable Shopify integration matched --shop=${SHOP}.`
            : 'No usable Shopify integration was found.'}`
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
    const [shopData, orders] = await Promise.all([
      shopifyRestJson(ctx, 'shop.json', { query: { fields: 'name,plan_name,domain,email,currency' } }),
      listCanaryOrders(ctx),
    ]);

    const shop = shopData.shop;
    const testOrders = orders.filter((order) => order.test === true);
    const liveOrders = orders.filter((order) => order.test !== true);
    const refundableTestOrder = await findRefundableTestOrder(ctx, testOrders);
    const planName = String(shop?.plan_name ?? 'unknown');
    const isDevelopmentPlan = DEVELOPMENT_PLANS.has(planName.toLowerCase());
    const mutationsAllowed = isDevelopmentPlan || ALLOW_LIVE_STORE || TEST_ORDERS_ONLY;

    return {
      shop: {
        fingerprint: fingerprint(ctx.shop),
        name: shop?.name ?? null,
        planName,
        domain: shop?.domain ?? null,
        currency: shop?.currency ?? null,
        isDevelopmentPlan,
        mutationsAllowed,
        writeMode: TEST_ORDERS_ONLY
          ? 'new-test-orders-only'
          : isDevelopmentPlan
            ? 'development-plan'
            : ALLOW_LIVE_STORE
              ? 'explicit-live-store'
              : 'inspect-only',
      },
      recentOrders: {
        totalSampled: orders.length,
        testCount: testOrders.length,
        liveCount: liveOrders.length,
        candidateTestOrderId: refundableTestOrder?.id ? String(refundableTestOrder.id) : null,
        testOrderIds: testOrders.map((order) => String(order.id)),
        fullRefundCandidates: testOrders.filter(isFullRefundCandidate).map((order) => ({
          id: String(order.id),
          name: order.name ?? null,
          total: order.current_total_price ?? order.total_price ?? null,
        })),
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
        writeMode: 'inspect-only',
      },
      recentOrders: {
        totalSampled: 0,
        testCount: 0,
        liveCount: 0,
        candidateTestOrderId: null,
        testOrderIds: [],
        fullRefundCandidates: [],
      },
      connectivityError: error instanceof Error ? error.message : String(error),
    };
  }
}

// Fixture discovery must not depend on the ten newest orders. The canary itself
// creates live-looking orders, so a client-side test filter over one small page
// eventually hides perfectly usable test fixtures. Walk the whole REST cursor
// instead (bounded defensively for a misconfigured non-development store).
async function listCanaryOrders(ctx) {
  const orders = [];
  let pageInfo = null;
  for (let page = 0; page < 20; page += 1) {
    const response = await shopifyRest(ctx, 'orders.json', {
      query: pageInfo
        ? {
          limit: 250,
          page_info: pageInfo,
          fields: 'id,name,test,financial_status,cancelled_at,total_price,current_total_price',
        }
        : {
          status: 'any',
          limit: 250,
          fields: 'id,name,test,financial_status,cancelled_at,total_price,current_total_price',
        },
    });
    orders.push(...(response.data.orders ?? []));
    pageInfo = parseNextPageInfo(response.headers);
    if (!pageInfo) return orders;
  }
  throw new Error('Order fixture scan exceeded 5,000 orders; choose a dedicated development store.');
}

// A token carries whatever grant it was issued with, so an install older than a
// capability expansion is short some scopes. Without this the gap only shows up
// mid-canary as a 403 that is indistinguishable from a Shopify-side rejection.
async function inspectAccessScopes(ctx) {
  try {
    const data = await shopifyGraphql(ctx, `
      query ShopkeeperGrantedScopes {
        currentAppInstallation { accessScopes { handle } }
      }
    `, {});
    const granted = (data?.currentAppInstallation?.accessScopes ?? [])
      .map((scope) => scope?.handle)
      .filter(Boolean)
      .sort();
    return { granted, missing: missingShopifyScopes(granted), error: null };
  } catch (error) {
    return {
      granted: null,
      missing: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Store credit carries no field we control - StoreCreditAccountCreditInput is
// creditAmount plus expiresAt - so probeStoreCredit reconciles on the amount
// alone (reconciliation-probes.ts:228). A second $0.01 credit on the same
// account therefore matches twice and reports `unknown` for a run that worked,
// the same trap the full-refund family avoids by requiring a clean order. Each
// run gets its own customer instead, which also parks the credit on someone who
// will never check out: store-credit.ts has a credit mutation and no debit, so
// nothing in our code can take it back.
async function createCanaryCustomer(ctx, operationId) {
  const email = `shopkeeper-canary+${Date.now()}@example.com`;
  const data = await shopifyRestJson(ctx, 'customers.json', {
    method: 'POST',
    body: {
      customer: {
        email,
        first_name: 'Canary',
        last_name: 'Shopkeeper',
        tags: 'shopkeeper-canary',
        note: `Shopkeeper store-credit canary ${operationId}`,
      },
    },
  });
  const id = data.customer?.id;
  if (!id) {
    throw new Error('Shopify accepted the canary customer but returned no id.');
  }
  return { id: String(id), email };
}

const CANARY_INITIAL_ADDRESS = Object.freeze({
  first_name: 'Canary',
  last_name: 'Shopkeeper',
  address1: '1 Canary Test St',
  city: 'Portland',
  province: 'OR',
  zip: '97201',
  country: 'US',
});

const CANARY_UPDATED_ADDRESS = Object.freeze({
  address1: '2 Canary Verified Ave',
  city: 'Portland',
  province: 'OR',
  zip: '97202',
  country: 'US',
});

function normalizedAddressPart(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function canaryAddressMatches(actual, expected) {
  if (!actual) return false;
  if (normalizedAddressPart(actual.address1) !== normalizedAddressPart(expected.address1)) return false;
  if (normalizedAddressPart(actual.city) !== normalizedAddressPart(expected.city)) return false;
  if (normalizedAddressPart(actual.zip) !== normalizedAddressPart(expected.zip)) return false;
  const expectedProvince = normalizedAddressPart(expected.province);
  const actualProvinces = [actual.province, actual.province_code].map(normalizedAddressPart);
  if (!actualProvinces.includes(expectedProvince)) return false;
  const expectedCountry = normalizedAddressPart(expected.country);
  const actualCountries = [actual.country, actual.country_code].map(normalizedAddressPart);
  return actualCountries.includes(expectedCountry)
    || (expectedCountry === 'us' && actualCountries.includes('united states'));
}

async function createCanaryOrderFixture(
  ctx,
  {
    family,
    variants,
    financialStatus = 'PENDING',
    transaction = null,
  },
) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`Cannot create ${family} fixture: the store has no active product variant.`);
  }

  const email = `shopkeeper-${family}-canary+${Date.now()}@example.com`;
  const mailingAddress = {
    firstName: CANARY_INITIAL_ADDRESS.first_name,
    lastName: CANARY_INITIAL_ADDRESS.last_name,
    address1: CANARY_INITIAL_ADDRESS.address1,
    city: CANARY_INITIAL_ADDRESS.city,
    provinceCode: CANARY_INITIAL_ADDRESS.province,
    zip: CANARY_INITIAL_ADDRESS.zip,
    countryCode: CANARY_INITIAL_ADDRESS.country,
  };
  const variables = {
    order: {
      email,
      test: true,
      financialStatus,
      lineItems: variants.map((variant) => ({
        variantId: `gid://shopify/ProductVariant/${variant.id}`,
        quantity: 1,
      })),
      ...(transaction ? { transactions: [transaction] } : {}),
      customer: {
        toUpsert: {
          email,
          firstName: CANARY_INITIAL_ADDRESS.first_name,
          lastName: CANARY_INITIAL_ADDRESS.last_name,
        },
      },
      shippingAddress: mailingAddress,
      billingAddress: mailingAddress,
      tags: ['shopkeeper-canary', `shopkeeper-${family}-canary`],
    },
    options: {
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  };

  const skipped = await shopifyGraphql(
    ctx,
    skippedMutationDocument({
      document: CANARY_FULFILLED_ORDER_CREATE_MUTATION,
      rootField: 'orderCreate',
    }),
    variables,
    { maxRetries: 0 },
  );
  if (skipped && typeof skipped === 'object' && 'orderCreate' in skipped) {
    throw new Error(`Shopify did not honor @skip for the ${family} fixture preflight.`);
  }

  const data = await shopifyGraphql(
    ctx,
    CANARY_FULFILLED_ORDER_CREATE_MUTATION,
    variables,
    { maxRetries: 0 },
  );
  const userErrors = data.orderCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `Could not create ${family} test order: ${userErrors.map((error) => error.message).join(', ')}`,
    );
  }
  const order = data.orderCreate?.order;
  if (!order?.id) {
    throw new Error(`Shopify accepted the ${family} fixture request but returned no order id.`);
  }
  if (order.test !== true) {
    throw new Error(`Shopify created ${family} fixture ${order.name ?? order.id} as a non-test order.`);
  }
  if (!order.customer?.id) {
    throw new Error(`Shopify created ${family} fixture without the expected customer ownership.`);
  }

  return {
    id: String(order.id).replace(/^gid:\/\/shopify\/Order\//, ''),
    name: order.name ?? null,
    customerId: String(order.customer.id).replace(/^gid:\/\/shopify\/Customer\//, ''),
    variants,
  };
}

async function createOrderRiskCanaryFixture(ctx, currency) {
  const email = `shopkeeper-order-risk-canary+${Date.now()}@example.com`;
  const variables = {
    order: {
      email,
      test: true,
      financialStatus: 'PENDING',
      lineItems: [{
        title: 'Shopkeeper order-risk canary',
        quantity: 1,
        priceSet: { shopMoney: { amount: '300.00', currencyCode: currency } },
      }],
      customer: {
        toUpsert: { email, firstName: 'Canary', lastName: 'Shopkeeper' },
      },
      billingAddress: {
        firstName: 'Canary',
        lastName: 'Shopkeeper',
        address1: '1 Canary Test St',
        city: 'Portland',
        provinceCode: 'OR',
        zip: '97201',
        countryCode: 'US',
      },
      shippingAddress: {
        firstName: 'Canary',
        lastName: 'Shopkeeper',
        address1: '1 Canary Test St',
        city: 'Vancouver',
        provinceCode: 'BC',
        zip: 'V6B 1A1',
        countryCode: 'CA',
      },
      tags: ['shopkeeper-canary', 'shopkeeper-order-risk-canary'],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  };
  const skipped = await shopifyGraphql(
    ctx,
    skippedMutationDocument({
      document: CANARY_FULFILLED_ORDER_CREATE_MUTATION,
      rootField: 'orderCreate',
    }),
    variables,
    { maxRetries: 0 },
  );
  if (skipped && typeof skipped === 'object' && 'orderCreate' in skipped) {
    throw new Error('Shopify did not honor @skip for the order-risk fixture preflight.');
  }
  const data = await shopifyGraphql(
    ctx,
    CANARY_FULFILLED_ORDER_CREATE_MUTATION,
    variables,
    { maxRetries: 0 },
  );
  const userErrors = data.orderCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(`Could not create order-risk test order: ${userErrors.map((error) => error.message).join(', ')}`);
  }
  const order = data.orderCreate?.order;
  if (!order?.id || order.test !== true) {
    throw new Error('Shopify did not return a test order for the order-risk fixture.');
  }
  return {
    id: String(order.id).replace(/^gid:\/\/shopify\/Order\//, ''),
    name: order.name ?? null,
  };
}

async function readCanaryCustomerAddress(ctx, customerId) {
  const data = await shopifyRestJson(ctx, `customers/${customerId}.json`, {
    query: { fields: 'id,default_address' },
  });
  return data.customer?.default_address ?? null;
}

// The return family needs something no other family does: a *fulfilled* order.
// returnCreate builds its line items from returnableFulfillments, so an
// unfulfilled order - which is every order order_creation leaves behind - has
// nothing returnable on it. The fixture must also carry no open return, or
// probeReturn cannot tell this run's return from the one already there.
// `rejected` is the point of the return value, not a nicety: this scan is the
// only thing standing between "no fixture" and an operator guessing which order
// to go fulfil, and a skip that names no order costs a round-trip to answer.
async function findReturnFixtureOrder(ctx, orderIds, excludedOrderIds = new Set()) {
  const rejected = [];
  for (const orderId of orderIds) {
    if (excludedOrderIds.has(String(orderId))) continue;
    const orderGid = `gid://shopify/Order/${orderId}`;
    const data = await shopifyGraphql(ctx, `
      query CanaryOrderReturns($id: ID!) {
        order(id: $id) { name returns(first: 10) { edges { node { status } } } }
      }
    `, { id: orderGid });
    const name = data.order?.name ?? null;

    const returnable = await fetchReturnableLineItems(ctx, orderGid);
    if (!returnable) {
      rejected.push({ orderId, name, reason: 'order not found' });
      continue;
    }
    if (returnable.length === 0) {
      rejected.push({ orderId, name, reason: 'no returnable items - not fulfilled, or already returned' });
      continue;
    }

    const open = (data.order?.returns?.edges ?? [])
      .filter((edge) => OPEN_RETURN_STATUSES.has(edge.node?.status ?? ''));
    if (open.length > 0) {
      rejected.push({ orderId, name, reason: `already carries ${open.length} open return(s)` });
      continue;
    }

    return {
      id: String(orderId),
      name,
      source: 'selected',
      returnableItems: returnable,
      rejected,
    };
  }
  return { id: null, rejected };
}

const CANARY_FULFILLED_ORDER_CREATE_MUTATION = `mutation CanaryFulfilledOrderCreate(
  $order: OrderCreateOrderInput!
  $options: OrderCreateOptionsInput
) {
  orderCreate(order: $order, options: $options) {
    order { id name test customer { id } }
    userErrors { field message }
  }
}`;

async function loadActiveVariants(ctx) {
  const products = await shopifyRestJson(ctx, 'products.json', {
    query: { status: 'active', limit: 250, fields: 'id,title,variants' },
  });
  return (products.products ?? []).flatMap((product) =>
    (product.variants ?? []).map((variant) => ({
      id: String(variant.id),
      title: `${product.title ?? 'Product'} - ${variant.title ?? 'Variant'}`,
      priceCents: moneyToCents(variant.price),
    })),
  );
}

function exchangePairForFixture(returnFixture, variants) {
  for (const item of returnFixture.returnableItems ?? []) {
    const returnedId = String(item.variantId ?? '').replace(/^gid:\/\/shopify\/ProductVariant\//, '');
    if (!returnedId) continue;
    const returned = variants.find((variant) => variant.id === returnedId);
    if (!returned || returned.priceCents === null) continue;
    const replacement = variants.find((variant) => (
      variant.id !== returned.id
      && variant.priceCents !== null
      && variant.priceCents <= returned.priceCents
    ));
    if (!replacement) continue;
    return {
      returned,
      replacement,
    };
  }
  return null;
}

function exchangePairForNewOrder(variants) {
  for (const returned of variants) {
    if (returned.priceCents === null) continue;
    const replacement = variants.find((variant) => (
      variant.id !== returned.id
      && variant.priceCents !== null
      && variant.priceCents <= returned.priceCents
    ));
    if (replacement) return { returned, replacement };
  }
  return null;
}

async function createFulfilledTestOrder(ctx, variant, family) {
  const variables = {
    order: {
      email: `shopkeeper-${family}-canary+${Date.now()}@example.com`,
      test: true,
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      lineItems: [{
        variantId: `gid://shopify/ProductVariant/${variant.id}`,
        quantity: 1,
      }],
      tags: ['shopkeeper-canary', `shopkeeper-${family}-canary`],
    },
    options: {
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  };

  // Coerce the exact fixture variables against the live schema before allowing
  // the side effect. A bad document or stale input shape stops at validation.
  const skipped = await shopifyGraphql(
    ctx,
    skippedMutationDocument({
      document: CANARY_FULFILLED_ORDER_CREATE_MUTATION,
      rootField: 'orderCreate',
    }),
    variables,
    { maxRetries: 0 },
  );
  if (skipped && typeof skipped === 'object' && 'orderCreate' in skipped) {
    throw new Error('Shopify did not honor @skip for the exchange fixture preflight.');
  }

  const data = await shopifyGraphql(
    ctx,
    CANARY_FULFILLED_ORDER_CREATE_MUTATION,
    variables,
    { maxRetries: 0 },
  );
  const userErrors = data.orderCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(`Could not create fulfilled test order: ${userErrors.map((error) => error.message).join(', ')}`);
  }
  const order = data.orderCreate?.order;
  if (!order?.id || order.test !== true) {
    throw new Error('Shopify did not return a test order for the fulfilled exchange fixture.');
  }
  const id = String(order.id).replace(/^gid:\/\/shopify\/Order\//, '');
  const returnableItems = await fetchReturnableLineItems(ctx, order.id);
  if (!returnableItems?.length) {
    throw new Error(`Created ${family} test order ${order.name ?? id}, but it has no returnable fulfilled items.`);
  }
  return {
    id,
    name: order.name ?? null,
    source: 'created-fulfilled-test-order',
    returnableItems,
  };
}

async function findExchangeFixture(ctx, returnFixture) {
  const variants = await loadActiveVariants(ctx);
  let fixture = returnFixture;
  let pair = fixture?.id ? exchangePairForFixture(fixture, variants) : null;

  if (!fixture?.id) {
    pair = exchangePairForNewOrder(variants);
    if (!pair) {
      return { id: null, reason: 'the store has no two active variants where the replacement does not cost more' };
    }
    fixture = await createFulfilledTestOrder(ctx, pair.returned, 'exchange');
    pair = exchangePairForFixture(fixture, variants);
  }

  if (pair) {
    return {
      ...fixture,
      returnVariantId: pair.returned.id,
      returnVariantTitle: pair.returned.title,
      exchangeVariantId: pair.replacement.id,
      exchangeVariantTitle: pair.replacement.title,
    };
  }
  return {
    id: null,
    reason: `order ${fixture.name ?? fixture.id} has no different active replacement variant at or below the returned item's price`,
  };
}

async function resolveReturnFixture(ctx, orderIds) {
  const existing = await findReturnFixtureOrder(ctx, orderIds);
  if (existing.id) return existing;

  const variants = await loadActiveVariants(ctx);
  const variant = variants.find((candidate) => candidate.id);
  if (!variant) {
    return {
      id: null,
      source: null,
      returnableItems: [],
      rejected: existing.rejected,
      reason: 'the store has no active product variant for a fulfilled test order',
    };
  }

  const created = await createFulfilledTestOrder(ctx, variant, 'return-label');
  return {
    ...created,
    rejected: existing.rejected,
  };
}

// Return-label and exchange verification may create dedicated fulfilled *test*
// orders with orderCreate. Unlike fulfilling an existing order, that needs no
// fulfillment-order scope, sends no receipt, and cannot be mistaken for a
// customer's live order.
// `ok` for the family means every step committed. Rolling the steps up rather
// than reporting only the last one is what keeps the run's exit code honest: a
// return that failed and a label that never ran must not read as green.
function worstStatus(statuses) {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('unknown')) return 'unknown';
  return 'ok';
}

function worstProbeOutcome(outcomes) {
  return outcomes.find((outcome) => outcome !== 'committed') ?? 'committed';
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
      // describeError, not error.message: ShopifyRequestError's message is a
      // fixed string and the GraphQL error text lives on `payload`. Reporting
      // only the message is what made an earlier run unreadable - twice, in the
      // validator and then here.
      error: describeError(error),
    };
  }
}

// Representative variables per mutation document. These mirror the shapes the
// production callers build - a fixture that diverges validates nothing - but
// every id points at a resource that does not exist, so even the catastrophic
// case where a server ignores @skip cannot touch a real order or customer.
const VALIDATION_CASES = [
  {
    name: 'discountCodeBasicCreate',
    document: 'discountCodeBasicCreate',
    variables: {
      basicCodeDiscount: {
        title: 'Shopkeeper validation probe',
        code: 'SHOPKEEPER-VALIDATION-PROBE',
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2020-01-02T00:00:00.000Z',
        customerSelection: { all: true },
        customerGets: { items: { all: true }, value: { percentage: 0.1 } },
        appliesOncePerCustomer: true,
        usageLimit: 1,
      },
    },
  },
  {
    // Mirrors fulfillOrder's shape: one fulfillment order, explicit line-item
    // quantities, and tracking, so the trackingInfo branch is type-checked too.
    // notifyCustomer is false here even though the tool defaults to true — a
    // validation probe must not be one @skip regression away from emailing
    // someone that their order shipped.
    name: 'fulfillmentCreate',
    document: 'fulfillmentCreate',
    variables: {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{
          fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1',
          fulfillmentOrderLineItems: [{
            id: 'gid://shopify/FulfillmentOrderLineItem/1',
            quantity: 1,
          }],
        }],
        notifyCustomer: false,
        trackingInfo: {
          number: 'SHOPKEEPER-VALIDATION-PROBE',
          company: 'UPS',
          url: 'https://example.invalid/track/SHOPKEEPER-VALIDATION-PROBE',
        },
      },
    },
  },
  {
    name: 'giftCardCreate',
    document: 'giftCardCreate',
    variables: {
      input: {
        initialValue: '0.01',
        code: 'SHOPKEEPERVALIDATION0',
        note: 'Shopkeeper validation probe',
        customerId: 'gid://shopify/Customer/1',
        recipientAttributes: { id: 'gid://shopify/Customer/1' },
        expiresOn: '2020-01-01',
      },
    },
  },
  {
    name: 'orderEditBegin',
    document: 'orderEditBegin',
    variables: { id: 'gid://shopify/Order/1' },
  },
  {
    name: 'orderEditAddVariant',
    document: 'orderEditAddVariant',
    variables: { id: 'gid://shopify/CalculatedOrder/1', variantId: 'gid://shopify/ProductVariant/1', quantity: 1 },
  },
  {
    name: 'orderEditSetQuantity',
    document: 'orderEditSetQuantity',
    variables: { id: 'gid://shopify/CalculatedOrder/1', lineItemId: 'gid://shopify/CalculatedLineItem/1', quantity: 0 },
  },
  {
    name: 'orderEditCommit',
    document: 'orderEditCommit',
    variables: { id: 'gid://shopify/CalculatedOrder/1' },
  },
  {
    // The branch the canary exercises: an explicit amount, no shipping or line items.
    name: 'refundCreate.partial',
    document: 'refundCreate',
    variables: {
      input: {
        orderId: 'gid://shopify/Order/1',
        notify: true,
        note: 'Shopkeeper validation probe',
        currency: 'USD',
        transactions: [{
          orderId: 'gid://shopify/Order/1',
          kind: 'REFUND',
          gateway: 'bogus',
          amount: '0.01',
          parentId: 'gid://shopify/OrderTransaction/1',
        }],
      },
      idempotencyKey: '00000000-0000-4000-8000-000000000000',
    },
  },
  {
    // The branch no canary has ever run: shipping.fullRefund plus the
    // refundLineItems built by graphqlRefundLineItems (refunds.ts:133).
    name: 'refundCreate.full',
    document: 'refundCreate',
    variables: {
      input: {
        orderId: 'gid://shopify/Order/1',
        notify: true,
        note: 'Shopkeeper validation probe',
        currency: 'USD',
        shipping: { fullRefund: true },
        refundLineItems: [{
          lineItemId: 'gid://shopify/LineItem/1',
          quantity: 1,
          restockType: 'RETURN',
          locationId: 'gid://shopify/Location/1',
        }],
        transactions: [{
          orderId: 'gid://shopify/Order/1',
          kind: 'REFUND',
          gateway: 'bogus',
          amount: '0.01',
          parentId: 'gid://shopify/OrderTransaction/1',
        }],
      },
      idempotencyKey: '00000000-0000-4000-8000-000000000000',
    },
  },
  {
    name: 'reverseDeliveryCreateWithShipping',
    document: 'reverseDeliveryCreateWithShipping',
    variables: {
      reverseFulfillmentOrderId: 'gid://shopify/ReverseFulfillmentOrder/1',
      labelInput: { fileUrl: 'https://example.com/label.pdf' },
      trackingInput: { number: 'SHOPKEEPER-VALIDATION-PROBE' },
    },
  },
  {
    name: 'returnCreate.return',
    document: 'returnCreate',
    variables: {
      returnInput: {
        orderId: 'gid://shopify/Order/1',
        notifyCustomer: false,
        returnLineItems: [{
          fulfillmentLineItemId: 'gid://shopify/FulfillmentLineItem/1',
          quantity: 1,
          returnReason: 'UNKNOWN',
        }],
      },
    },
  },
  {
    // createExchange sends a second shape through the same document.
    name: 'returnCreate.exchange',
    document: 'returnCreate',
    variables: {
      returnInput: {
        orderId: 'gid://shopify/Order/1',
        returnLineItems: [{
          fulfillmentLineItemId: 'gid://shopify/FulfillmentLineItem/1',
          quantity: 1,
          returnReason: 'UNKNOWN',
        }],
        exchangeLineItems: [{ variantId: 'gid://shopify/ProductVariant/1', quantity: 1 }],
      },
    },
  },
  {
    name: 'storeCreditAccountCredit',
    document: 'storeCreditAccountCredit',
    variables: {
      id: 'gid://shopify/Customer/1',
      creditInput: {
        creditAmount: { amount: '0.01', currencyCode: 'USD' },
        expiresAt: '2020-01-01',
      },
    },
  },
];

// Everything in this mode rests on Shopify honoring @skip on a mutation root
// field. Prove that before sending documents whose execution would have real
// side effects, using the one case that is harmless even if it does execute:
// orderEditBegin against a nonexistent order opens no session and commits
// nothing. If the root field comes back in `data`, the server executed a
// skipped field and no further probe is safe to send.
async function preflightSkipHonored(ctx) {
  const entry = SHOPIFY_MUTATION_DOCUMENTS.orderEditBegin;
  try {
    const data = await shopifyGraphql(
      ctx,
      skippedMutationDocument(entry),
      { id: 'gid://shopify/Order/1' },
      { maxRetries: 0 },
    );
    const executed = data !== null && typeof data === 'object' && entry.rootField in data;
    return {
      honored: !executed,
      detail: executed
        ? 'Shopify returned the root field for a @skip(if: true) mutation; it executed the field.'
        : null,
    };
  } catch (error) {
    // A validation error here cannot distinguish "@skip is rejected" from "this
    // document is bad", and either way the mode's premise is unproven.
    return {
      honored: false,
      detail: `Skip preflight failed: ${describeError(error)}`,
    };
  }
}

async function runValidation(ctx) {
  const results = [];

  for (const testCase of VALIDATION_CASES) {
    if (!shouldRun(testCase.name) && !shouldRun(testCase.document)) continue;

    const entry = SHOPIFY_MUTATION_DOCUMENTS[testCase.document];
    if (!entry) {
      results.push({
        case: testCase.name,
        outcome: 'no_such_document',
        detail: `${testCase.document} is not in SHOPIFY_MUTATION_DOCUMENTS.`,
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      const data = await shopifyGraphql(
        ctx,
        skippedMutationDocument(entry),
        testCase.variables,
        { maxRetries: 0 },
      );
      // An absent root-field key is the proof the field was skipped rather than
      // executed. If it is present the server ran the mutation, which is the one
      // outcome this mode must never produce.
      const executed = data !== null && typeof data === 'object' && entry.rootField in data;
      results.push({
        case: testCase.name,
        document: testCase.document,
        outcome: executed ? 'EXECUTED' : 'valid',
        durationMs: Date.now() - startedAt,
        ...(executed ? { detail: 'Server did not honor @skip; the mutation ran.' } : {}),
      });
    } catch (error) {
      results.push({
        case: testCase.name,
        document: testCase.document,
        outcome: 'invalid',
        durationMs: Date.now() - startedAt,
        detail: describeError(error),
      });
    }
  }

  return results;
}

// A mutation document with no validation case is the drift this mode exists to
// prevent: it would be schema-checked by nothing and look fine.
function uncoveredMutationDocuments() {
  const covered = new Set(VALIDATION_CASES.map((testCase) => testCase.document));
  return Object.keys(SHOPIFY_MUTATION_DOCUMENTS).filter((name) => !covered.has(name));
}

// Queries need none of the @skip machinery above: a read against a nonexistent
// id commits nothing, so the document is sent as-is and either validates or does
// not. That also means this leg does not depend on the skip preflight, and still
// runs when the preflight is inconclusive.
//
// There is no uncovered-document list to compute here, because the registry
// carries its own fixture variables - a document cannot be registered without
// one. The drift that remains, a query in the package that was never registered
// at all, is guarded in query-documents.test.ts, which compares the registry
// against the source files.
async function runQueryValidation(ctx) {
  const results = [];

  for (const [name, entry] of Object.entries(SHOPIFY_QUERY_DOCUMENTS)) {
    if (!shouldRun(name)) continue;

    const startedAt = Date.now();
    try {
      await shopifyGraphql(ctx, entry.document, entry.variables, { maxRetries: 0 });
      results.push({
        document: name,
        outcome: 'valid',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        document: name,
        outcome: 'invalid',
        durationMs: Date.now() - startedAt,
        detail: describeError(error),
      });
    }
  }

  return results;
}

async function runCanaries(ctx, inspection, returnFixture, exchangeFixture) {
  const results = [];
  const operationBase = `canary:${randomUUID()}`;

  if (shouldRun('gift_card') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('gift_card', async () => {
      const operationId = `${operationBase}:gift_card`;
      const input = { amount: '1.00', reason: 'Shopkeeper mutation canary' };
      const result = await createGiftCard(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('create_gift_card', input, { ...ctx, operationId });
      // `status` alone cannot tell a rejected mutation from an ambiguous one:
      // several branches return `unknown`, and only the message names which.
      return {
        status: result.status,
        message: result.message,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  let testOrderId = inspection.recentOrders.candidateTestOrderId;
  if (shouldRun('refund') && inspection.shop.mutationsAllowed && !testOrderId) {
    const variants = await loadActiveVariants(ctx);
    const variant = variants.find((entry) => entry.priceCents != null && entry.priceCents > 0);
    if (!variant) {
      throw new Error('Cannot create refund fixture: the store has no positive-price active variant.');
    }
    const amount = (variant.priceCents / 100).toFixed(2);
    const fixture = await createCanaryOrderFixture(ctx, {
      family: 'refund',
      variants: [variant],
      financialStatus: 'PAID',
      transaction: {
        amountSet: {
          shopMoney: {
            amount,
            currencyCode: inspection.shop.currency,
          },
        },
        gateway: 'shopkeeper_canary',
        kind: 'SALE',
        status: 'SUCCESS',
        test: true,
      },
    });
    testOrderId = fixture.id;
  }
  if (shouldRun('refund') && inspection.shop.mutationsAllowed && testOrderId) {
    results.push(await runFamily('refund', async () => {
      const operationId = `${operationBase}:refund`;
      const input = { order_id: testOrderId, amount: '0.01', reason: 'Shopkeeper mutation canary' };
      const result = await createRefund(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('create_refund', input, { ...ctx, operationId });
      // `status` alone cannot tell a rejected mutation from an ambiguous one:
      // several branches return `unknown`, and only the message names which.
      return {
        status: result.status,
        message: result.message,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  // The partial branch above is the only one that has ever executed. Omitting
  // `amount` takes buildFullRefundTransactions and graphqlRefundLineItems
  // instead, which --validate can type-check but cannot exercise.
  const fullRefundOrder = selectFullRefundOrder(inspection);
  if (shouldRun('refund_full') && inspection.shop.mutationsAllowed && fullRefundOrder) {
    results.push(await runFamily('refund_full', async () => {
      const operationId = `${operationBase}:refund_full`;
      const input = { order_id: fullRefundOrder.id, reason: 'Shopkeeper mutation canary' };
      const result = await createRefund(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('create_refund', input, { ...ctx, operationId });
      const orderTotalCents = moneyToCents(fullRefundOrder.total);
      return {
        status: result.status,
        message: result.message,
        orderId: fullRefundOrder.id,
        orderName: fullRefundOrder.name,
        // `ok` only proves the document ran. Whether the right transactions
        // were picked and the whole order came back is what this family is for,
        // and only the totals say that.
        orderTotalCents,
        refundedCents: result.refundedCents,
        matchesOrderTotal: orderTotalCents === null || result.refundedCents === null
          ? null
          : result.refundedCents === orderTotalCents,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('store_credit') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('store_credit', async () => {
      const operationId = `${operationBase}:store_credit`;
      const customer = await createCanaryCustomer(ctx, operationId);
      const input = { customer_id: customer.id, amount: '0.01' };
      const result = await issueStoreCredit(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation('issue_store_credit', input, { ...ctx, operationId });
      // `status` alone cannot tell a rejected mutation from an ambiguous one:
      // several branches return `unknown`, and only the message names which.
      return {
        status: result.status,
        message: result.message,
        customerId: customer.id,
        customerEmail: customer.email,
        // The tool downgrades to `unknown` unless the committed amount equals
        // the requested one, so this is what `ok` is asserting about the money.
        spentCents: result.spentCents,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
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
      // `status` alone cannot tell a rejected mutation from an ambiguous one:
      // several branches return `unknown`, and only the message names which.
      return {
        status: result.status,
        message: result.message,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('order_risk_fixture') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('order_risk_fixture', async () => {
      const fixture = await createOrderRiskCanaryFixture(ctx, inspection.shop.currency);
      return {
        status: 'ok',
        message: `Created controlled order-risk test fixture ${fixture.name ?? fixture.id}.`,
        orderId: fixture.id,
        orderName: fixture.name,
      };
    }));
  }

  if (shouldRun('cancel_order') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('cancel_order', async () => {
      const operationId = `${operationBase}:cancel_order`;
      const variants = await loadActiveVariants(ctx);
      const fixture = await createCanaryOrderFixture(ctx, {
        family: 'cancel-order',
        variants: variants.slice(0, 1),
      });
      const input = {
        order_id: fixture.id,
        reason: 'other',
        restock: true,
      };
      const result = await cancelOrder(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation(
        'cancel_order',
        input,
        { ...ctx, operationId },
      );
      return {
        status: result.status,
        message: result.message,
        orderId: fixture.id,
        orderName: fixture.name,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('edit_shopify_order') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('edit_shopify_order', async () => {
      const operationId = `${operationBase}:edit_shopify_order`;
      const variants = await loadActiveVariants(ctx);
      if (variants.length < 2) {
        throw new Error('Cannot create edit fixture: the store needs at least two active product variants.');
      }
      const fixture = await createCanaryOrderFixture(ctx, {
        family: 'edit-order',
        variants: variants.slice(0, 2),
      });
      // A remove-only edit has a conclusive independent probe: the fixture
      // proves the variant existed before execution, and zero afterward proves
      // this exact leg committed. Add-only deltas cannot be attributed from a
      // post-mutation read without storing the prior quantity.
      const input = {
        order_id: fixture.id,
        remove_variant_id: fixture.variants[0].id,
      };
      const result = await editShopifyOrder(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation(
        'edit_shopify_order',
        input,
        { ...ctx, operationId },
      );
      return {
        status: result.status,
        message: result.message,
        orderId: fixture.id,
        orderName: fixture.name,
        removedVariantId: fixture.variants[0].id,
        retainedVariantId: fixture.variants[1].id,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('update_shopify_order_address') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('update_shopify_order_address', async () => {
      const operationId = `${operationBase}:update_shopify_order_address`;
      const variants = await loadActiveVariants(ctx);
      const fixture = await createCanaryOrderFixture(ctx, {
        family: 'address-update',
        variants: variants.slice(0, 1),
      });
      if (!fixture.customerId) {
        throw new Error('Cannot create address fixture: Shopify returned no customer id.');
      }
      const beforeAddress = await readCanaryCustomerAddress(ctx, fixture.customerId);
      if (!canaryAddressMatches(beforeAddress, CANARY_INITIAL_ADDRESS)) {
        throw new Error('Cannot create address fixture: customer default address does not match the test order.');
      }
      const input = {
        order_id: fixture.id,
        customer_id: fixture.customerId,
        ...CANARY_UPDATED_ADDRESS,
      };
      const result = await updateShopifyOrderAddress(input, { ...ctx, operationId });
      const [probe, customerAddress] = await Promise.all([
        probeUnknownShopifyMutation(
          'update_shopify_order_address',
          input,
          { ...ctx, operationId },
        ),
        readCanaryCustomerAddress(ctx, fixture.customerId),
      ]);
      return {
        status: result.status,
        message: result.message,
        orderId: fixture.id,
        orderName: fixture.name,
        customerId: fixture.customerId,
        customerAddressMatches: canaryAddressMatches(customerAddress, CANARY_UPDATED_ADDRESS),
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  // Fulfillment is the one mutation whose side effect reaches the customer
  // directly, through Shopify's own shipping-confirmation email. Three things
  // hold that shut: a fixture order this run created, `sendFulfillmentReceipt`
  // off on that fixture, and `notify_customer: false` on the call itself.
  if (shouldRun('fulfill_order') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('fulfill_order', async () => {
      const operationId = `${operationBase}:fulfill_order`;
      const variants = await loadActiveVariants(ctx);
      const fixture = await createCanaryOrderFixture(ctx, {
        family: 'fulfill-order',
        variants: variants.slice(0, 1),
      });
      const orderGid = `gid://shopify/Order/${fixture.id}`;

      // Reading what is awaiting fulfillment *before* the call is what makes
      // the after-reading mean something: probeFulfillment treats "nothing left
      // to fulfill" as committed, which is only true if something was left a
      // moment earlier.
      const awaitingBefore = await fetchFulfillableFulfillmentOrders(ctx, orderGid);
      if (!awaitingBefore?.length) {
        throw new Error(
          `Cannot fulfil ${fixture.name ?? fixture.id}: the fixture has nothing awaiting fulfillment.`,
        );
      }

      // A unique tracking number is the probe's attribution key - it is what
      // lets reconciliation say "this call landed" rather than "some
      // fulfillment exists".
      const input = {
        order_id: fixture.id,
        tracking_number: `SHOPKEEPER-CANARY-${randomUUID().slice(0, 8).toUpperCase()}`,
        tracking_company: 'USPS',
        notify_customer: false,
      };
      const result = await fulfillOrder(input, { ...ctx, operationId });
      const [probe, awaitingAfter] = await Promise.all([
        probeUnknownShopifyMutation('fulfill_order', input, { ...ctx, operationId }),
        fetchFulfillableFulfillmentOrders(ctx, orderGid),
      ]);
      return {
        status: result.status,
        message: result.message,
        orderId: fixture.id,
        orderName: fixture.name,
        trackingNumber: input.tracking_number,
        awaitingBefore: awaitingBefore.length,
        awaitingAfter: awaitingAfter?.length ?? null,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('discount') && inspection.shop.mutationsAllowed) {
    results.push(await runFamily('discount', async () => {
      const operationId = `${operationBase}:issue_discount`;
      const input = {
        percentage: 1,
        reason: 'Shopkeeper mutation canary',
        expires_in_days: 1,
      };
      const result = await issueDiscount(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation(
        'issue_discount',
        input,
        { ...ctx, operationId },
      );
      return {
        status: result.status,
        message: result.message,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  if (shouldRun('exchange') && inspection.shop.mutationsAllowed && exchangeFixture?.id) {
    results.push(await runFamily('exchange', async () => {
      const operationId = `${operationBase}:create_exchange`;
      const input = {
        order_id: exchangeFixture.id,
        variant_id: exchangeFixture.returnVariantId,
        exchange_variant_id: exchangeFixture.exchangeVariantId,
        quantity: 1,
        reason: 'unwanted',
      };
      const result = await createExchange(input, { ...ctx, operationId });
      const probe = await probeUnknownShopifyMutation(
        'create_exchange',
        input,
        { ...ctx, operationId },
      );
      return {
        status: result.status,
        message: result.message,
        orderId: exchangeFixture.id,
        orderName: exchangeFixture.name,
        returnedVariant: exchangeFixture.returnVariantTitle,
        exchangeVariant: exchangeFixture.exchangeVariantTitle,
        probeOutcome: probe.outcome,
        probeMessage: probe.message,
      };
    }));
  }

  // create_return and attach_return_label are one family because they are one
  // workflow: a label can only be attached to a return that is already open, so
  // running the second without the first tests nothing.
  if (shouldRun('return_label') && inspection.shop.mutationsAllowed && returnFixture?.id) {
    results.push(await runFamily('return_label', async () => {
      const fixture = returnFixture;
      const returnOperationId = `${operationBase}:create_return`;
      const returnInput = { order_id: fixture.id, reason: 'unwanted' };
      const returnResult = await createReturn(returnInput, { ...ctx, operationId: returnOperationId });
      const returnProbe = await probeUnknownShopifyMutation(
        'create_return',
        returnInput,
        { ...ctx, operationId: returnOperationId },
      );

      const steps = [{
        tool: 'create_return',
        status: returnResult.status,
        message: returnResult.message,
        probeOutcome: returnProbe.outcome,
        probeMessage: returnProbe.message,
      }];

      // Attaching a label to a return that did not open tests the error path,
      // not the capability, and its failure message would bury the real one.
      if (returnResult.status === 'ok') {
        const labelOperationId = `${operationBase}:attach_return_label`;
        const labelInput = {
          order_id: fixture.id,
          label_url: 'https://example.com/shopkeeper-canary-return-label.pdf',
          // The probe's only handle on this call: Shopify re-hosts the label and
          // never echoes label_url back, so without a tracking number a reverse
          // delivery cannot be attributed to this run.
          tracking_number: `SKCANARY${Date.now()}`,
        };
        const labelResult = await attachReturnLabel(labelInput, { ...ctx, operationId: labelOperationId });
        const labelProbe = await probeUnknownShopifyMutation(
          'attach_return_label',
          labelInput,
          { ...ctx, operationId: labelOperationId },
        );
        steps.push({
          tool: 'attach_return_label',
          status: labelResult.status,
          message: labelResult.message,
          trackingNumber: labelInput.tracking_number,
          probeOutcome: labelProbe.outcome,
          probeMessage: labelProbe.message,
        });
      }

      return {
        status: worstStatus(steps.map((step) => step.status)),
        message: steps.map((step) => `${step.tool}: ${step.message}`).join(' | '),
        orderId: fixture.id,
        orderName: fixture.name,
        fixture: fixture.source,
        // A family that stopped after one step is not a pass, whatever that step
        // returned.
        stepsRun: steps.length,
        probeOutcome: steps.length === 2
          ? worstProbeOutcome(steps.map((step) => step.probeOutcome))
          : 'still_unknown',
        steps,
      };
    }));
  }

  return results;
}

const { organizationId, integrationId, skipped, ctx } = await loadShopifyIntegration();
const [storeInspection, accessScopes] = await Promise.all([
  inspectStore(ctx),
  inspectAccessScopes(ctx),
]);
const inspection = { ...storeInspection, accessScopes };

// Resolved before the report rather than inside the family so its absence can be
// a note that says what to do, the way the full-refund skip does, instead of a
// family that fails for a reason no operator can act on.
const returnFixture = EXECUTE && shouldRun('return_label') && inspection.shop.mutationsAllowed
  ? await resolveReturnFixture(
    ctx,
    TEST_ORDERS_ONLY ? [] : inspection.recentOrders.testOrderIds,
  )
  : null;
const exchangeReturnFixture = EXECUTE && shouldRun('exchange') && inspection.shop.mutationsAllowed
  ? await findReturnFixtureOrder(
    ctx,
    inspection.recentOrders.testOrderIds,
    new Set(returnFixture?.id ? [returnFixture.id] : []),
  )
  : null;
const exchangeFixture = exchangeReturnFixture
  ? await findExchangeFixture(ctx, exchangeReturnFixture)
  : null;

const report = {
  mode: EXECUTE
    ? 'execute'
    : VALIDATE
      ? 'validate'
      : RECONCILE_GIFT_CARD_CODE
        ? 'reconcile-gift-card'
        : 'inspect',
  organizationFingerprint: fingerprint(organizationId),
  integrationFingerprint: fingerprint(integrationId),
  selectedShop: ctx.shop,
  skippedIntegrations: skipped,
  inspection,
  // Validation sends each real mutation document with @skip(if: true) on its
  // root field. GraphQL validates the document and coerces variables before it
  // honors the skip, so this type-checks against the live schema with no side
  // effects - and needs no development-plan store.
  skipPreflight: VALIDATE ? await preflightSkipHonored(ctx) : null,
  validation: [],
  queryValidation: [],
  uncoveredMutationDocuments: VALIDATE ? uncoveredMutationDocuments() : [],
  canaries: EXECUTE ? await runCanaries(ctx, inspection, returnFixture, exchangeFixture) : [],
  giftCardReconciliation: RECONCILE_GIFT_CARD_CODE
    ? await reconcileGiftCardCode(ctx, RECONCILE_GIFT_CARD_CODE)
    : null,
  returnFixture,
  exchangeFixture,
  notes: [],
};

if (inspection.connectivityError) {
  report.notes.push(`Shopify connectivity failed: ${inspection.connectivityError}`);
}
if (accessScopes.error) {
  report.notes.push(`Granted-scope probe failed: ${accessScopes.error}`);
} else if (accessScopes.missing.length > 0) {
  report.notes.push(
    `Install is missing ${accessScopes.missing.length} requested scope(s): ${accessScopes.missing.join(', ')}.`
    + ' Re-authorize the store before reading any 403 from this run as a Shopify-side rejection.',
  );
}
// Validation executes nothing, so the development-plan gate does not apply to it.
if (!inspection.shop.mutationsAllowed && !VALIDATE) {
  report.notes.push(
    'Mutations refused: connected store is not a known development plan. Re-run with --allow-live-store only after explicit operator approval.',
  );
}
if (EXECUTE && !inspection.shop.mutationsAllowed) {
  report.notes.push('No canaries were executed.');
}
if (EXECUTE && TEST_ORDERS_ONLY) {
  report.notes.push(
    'Safety mode active: every selected family creates a new Shopify test order and never selects a live order.',
  );
}
if (
  EXECUTE
  && inspection.shop.mutationsAllowed
  && shouldRun('refund')
  && !report.canaries.some((entry) => entry.family === 'refund')
) {
  report.notes.push('Refund canary skipped: no recent test order was found.');
}
if (EXECUTE && inspection.shop.mutationsAllowed && shouldRun('return_label') && !returnFixture?.id) {
  report.notes.push(
    `Return-label canary skipped: ${returnFixture?.reason ?? 'a fulfilled test fixture could not be created'}.`,
  );
}
if (EXECUTE && inspection.shop.mutationsAllowed && shouldRun('exchange') && !exchangeFixture?.id) {
  report.notes.push(
    `Exchange canary skipped: ${exchangeFixture?.reason ?? 'a fulfilled test fixture could not be created'}.`,
  );
}
if (EXECUTE && inspection.shop.mutationsAllowed && shouldRun('refund_full') && !selectFullRefundOrder(inspection)) {
  report.notes.push(
    'Full-refund canary skipped: no unrefunded test order was available. It needs a paid,'
    + ' uncancelled test order that no other refund canary has touched.',
  );
}

if (VALIDATE && report.skipPreflight.honored) {
  report.validation = await runValidation(ctx);
}

// Deliberately outside the preflight guard: no query is skipped, so nothing about
// the mutation premise applies. A broken read kills a capability as dead as a
// broken write, and this leg is the guard for that class.
if (VALIDATE) {
  report.queryValidation = await runQueryValidation(ctx);
  const invalidQueries = report.queryValidation.filter((entry) => entry.outcome !== 'valid');
  if (invalidQueries.length > 0) {
    report.notes.push(
      `${invalidQueries.length} of ${report.queryValidation.length} query document(s) failed schema validation: `
      + `${invalidQueries.map((entry) => entry.document).join(', ')}.`,
    );
  }
}

if (VALIDATE && !report.skipPreflight.honored) {
  report.notes.push(
    `No mutation documents were validated: ${report.skipPreflight.detail}`,
  );
  report.uncoveredMutationDocuments = [];
}

if (VALIDATE && report.skipPreflight.honored) {
  const invalid = report.validation.filter((entry) => entry.outcome !== 'valid');
  if (invalid.length > 0) {
    report.notes.push(
      `${invalid.length} of ${report.validation.length} mutation document(s) failed schema validation: `
      + `${invalid.map((entry) => entry.case).join(', ')}.`,
    );
  }
  if (report.validation.some((entry) => entry.outcome === 'EXECUTED')) {
    report.notes.push(
      'A validation probe EXECUTED instead of being skipped. Treat the store as mutated and reconcile before re-running.',
    );
  }
  if (report.uncoveredMutationDocuments.length > 0) {
    report.notes.push(
      `${report.uncoveredMutationDocuments.length} mutation document(s) have no validation case: `
      + `${report.uncoveredMutationDocuments.join(', ')}. Add one to VALIDATION_CASES.`,
    );
  }
}

console.log(JSON.stringify(report, null, 2));

// A full refund that ran but returned the wrong total is the failure this
// harness exists to surface, so it must not read as a green run.
//
// Nor may a mutation that reports `ok` while its own reconciliation probe says
// the effect is not there. That disagreement is what exposed the store-credit
// probe defect, and reporting both without failing on the contradiction leaves
// the next one to be noticed by eye. `still_unknown` counts too: a probe that
// cannot confirm a mutation the tool called committed is not evidence of
// success, and every passing family returns `committed`.
const failed = report.canaries.filter((entry) => (
  !entry.ok
  || entry.status !== 'ok'
  || entry.matchesOrderTotal === false
  || entry.customerAddressMatches === false
  || (entry.status === 'ok' && entry.probeOutcome !== undefined && entry.probeOutcome !== 'committed')
));
if (EXECUTE && failed.length > 0) {
  process.exitCode = 1;
}
if (VALIDATE && (
  !report.skipPreflight.honored
  || report.validation.some((entry) => entry.outcome !== 'valid')
  || report.queryValidation.some((entry) => entry.outcome !== 'valid')
  || report.uncoveredMutationDocuments.length > 0
)) {
  process.exitCode = 1;
}

await db.$disconnect();
