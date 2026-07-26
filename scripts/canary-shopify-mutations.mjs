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
//   node scripts/canary-shopify-mutations.mjs --validate
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const {
  shopifyGraphql,
  shopifyRestJson,
  createGiftCard,
  createRefund,
  createShopifyOrder,
  issueStoreCredit,
  probeUnknownShopifyMutation,
  SHOPIFY_MUTATION_DOCUMENTS,
  skippedMutationDocument,
} = await import('@shopkeeper/agent/shopify');
const { missingShopifyScopes } = await import('@shopkeeper/agent/shopify/integration-health');

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has('--execute');
const VALIDATE = args.has('--validate');
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
          fields: 'id,name,test,financial_status,cancelled_at,total_price,current_total_price',
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
      },
      recentOrders: {
        totalSampled: 0,
        testCount: 0,
        liveCount: 0,
        candidateTestOrderId: null,
        fullRefundCandidates: [],
      },
      connectivityError: error instanceof Error ? error.message : String(error),
    };
  }
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

async function runCanaries(ctx, inspection) {
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

  const testOrderId = inspection.recentOrders.candidateTestOrderId;
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

  return results;
}

const { organizationId, integrationId, skipped, ctx } = await loadShopifyIntegration();
const [storeInspection, accessScopes] = await Promise.all([
  inspectStore(ctx),
  inspectAccessScopes(ctx),
]);
const inspection = { ...storeInspection, accessScopes };

const report = {
  mode: EXECUTE ? 'execute' : VALIDATE ? 'validate' : 'inspect',
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
  uncoveredMutationDocuments: VALIDATE ? uncoveredMutationDocuments() : [],
  canaries: EXECUTE ? await runCanaries(ctx, inspection) : [],
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
if (EXECUTE && inspection.shop.mutationsAllowed && shouldRun('refund') && !inspection.recentOrders.candidateTestOrderId) {
  report.notes.push('Refund canary skipped: no recent test order was found.');
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
  || entry.status === 'error'
  || entry.matchesOrderTotal === false
  || (entry.status === 'ok' && entry.probeOutcome !== undefined && entry.probeOutcome !== 'committed')
));
if (EXECUTE && failed.length > 0) {
  process.exitCode = 1;
}
if (VALIDATE && (
  !report.skipPreflight.honored
  || report.validation.some((entry) => entry.outcome !== 'valid')
  || report.uncoveredMutationDocuments.length > 0
)) {
  process.exitCode = 1;
}

await db.$disconnect();
