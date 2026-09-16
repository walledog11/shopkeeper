#!/usr/bin/env node
// Read-only probe for the refund settlement currency. Calculates a refund twice
// — once without naming a currency, once naming the order's presentment
// currency — and prints both answers. `refunds/calculate.json` commits nothing.
//
//   node scripts/probe-refund-currency.mjs --order=1031
//   DATABASE_URL=<prod> node scripts/probe-refund-currency.mjs --order=1031
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');
const { shopifyRestJson, shopifyGraphql } = await import('@shopkeeper/agent/shopify');

function arg(name, fallback) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const orderName = arg('order', '1031');
const wantedShop = arg('shop', null);

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? '').host; } catch { return 'unknown'; }
})();
console.log(`database host: ${host}`);

const rows = await db.integration.findMany({
  where: { platform: 'shopify' },
  select: { organizationId: true, externalAccountId: true, accessToken: true, lifecycleStatus: true },
});
const usable = rows.filter((r) => r.accessToken && r.externalAccountId
  && (!wantedShop || r.externalAccountId.includes(wantedShop)));
if (usable.length !== 1) {
  console.log(`Found ${usable.length} usable Shopify integrations (of ${rows.length} rows); need exactly 1.`);
  for (const r of rows) {
    console.log(`  ${r.externalAccountId ?? '(no shop)'}  org=${r.organizationId}  lifecycle=${r.lifecycleStatus}  token=${r.accessToken ? 'decrypted' : 'absent/undecryptable'}`);
  }
  console.log('Re-run with --shop=<substring>, or with the production DATABASE_URL if this is the wrong database.');
  await db.$disconnect();
  process.exit(1);
}

const ctx = {
  shop: usable[0].externalAccountId,
  accessToken: usable[0].accessToken,
  operationId: '00000000-0000-4000-8000-000000000000:probe_refund_currency',
};
console.log(`shop: ${ctx.shop}\n`);

const found = await shopifyRestJson(ctx, 'orders.json', {
  query: {
    name: `#${orderName}`,
    status: 'any',
    limit: 1,
    fields: 'id,name,currency,presentment_currency,total_price,current_total_price,total_price_set,current_total_price_set,financial_status,refunds,line_items',
  },
});
const order = found.orders?.[0];
if (!order) {
  console.log(`Order #${orderName} not found on ${ctx.shop}.`);
  await db.$disconnect();
  process.exit(1);
}

const presentment = (order.current_total_price_set ?? order.total_price_set)?.presentment_money;
console.log(`order ${order.name} (${order.id})  financial_status=${order.financial_status}  existing refunds=${order.refunds?.length ?? 0}`);
console.log(`  order.currency (shop books):  ${order.currency}`);
console.log(`  presentment_currency:         ${order.presentment_currency}`);
const shopSide = (order.current_total_price_set ?? order.total_price_set)?.shop_money;
console.log(`  presentment money:            ${presentment ? `${presentment.amount} ${presentment.currency_code}` : '(absent)'}`);
console.log(`  shop money (price set):       ${shopSide ? `${shopSide.amount} ${shopSide.currency_code}` : '(absent)'}`);
console.log(`  total_price:                  ${order.total_price}`);
console.log(`  current_total_price:          ${order.current_total_price}`);

// QUESTION 1 — `orderShopMoney` falls back to `current_total_price ?? total_price`
// labelled with `order.currency` whenever the price set is absent. That fallback
// is only correct if the bare REST total is the shop's own figure. If it matches
// the presentment amount instead, the fallback labels the customer's number with
// the merchant's currency, and the full-refund cap and the compensation ledger
// are both judged on it.
if (shopSide && presentment) {
  const bare = order.current_total_price ?? order.total_price;
  const verdict = bare === shopSide.amount
    ? `SHOP money — the orderShopMoney fallback is correct`
    : bare === presentment.amount
      ? `PRESENTMENT money — the orderShopMoney fallback is WRONG and mislabels it as ${order.currency}`
      : `neither (${bare}) — inspect by hand`;
  console.log(`\n  Q1: bare REST total is ............ ${verdict}`);
}

const refundLineItems = (order.line_items ?? [])
  .filter((li) => (li.current_quantity ?? li.quantity) > 0)
  .map((li) => ({ line_item_id: li.id, quantity: li.current_quantity ?? li.quantity, restock_type: 'no_restock' }));

async function calculate(currency) {
  const body = {
    refund: {
      ...(currency ? { currency } : {}),
      shipping: { full_refund: true },
      refund_line_items: refundLineItems,
    },
  };
  try {
    const res = await shopifyRestJson(ctx, `orders/${order.id}/refunds/calculate.json`, { method: 'POST', body });
    const txns = res.refund?.transactions ?? res.refund?.suggested_transactions ?? [];
    return `refund.currency=${res.refund?.currency}  transactions=[${txns.map((t) => `${t.amount} ${t.currency ?? '?'}`).join(', ')}]`;
  } catch (err) {
    return `ERROR ${err?.message ?? err}`;
  }
}

const settlement = presentment?.currency_code ?? order.presentment_currency ?? order.currency;
console.log(`\ncalculate WITHOUT a currency      : ${await calculate(null)}`);
console.log(`calculate WITH currency=${settlement}      : ${await calculate(settlement)}`);

// Open question the code currently handles both ways: does a calculation on a
// multi-currency order carry Shopify's own shop-money side? If it does, a
// workspace cap can be judged in the merchant's currency on a partial refund.
// If it does not, `createPartialRefund` refuses rather than compare across
// currencies, and this is the line that says which branch is live.
const raw = await shopifyRestJson(ctx, `orders/${order.id}/refunds/calculate.json`, {
  method: 'POST',
  body: { refund: { currency: settlement, shipping: { full_refund: true }, refund_line_items: refundLineItems } },
}).catch((err) => ({ error: err?.message ?? String(err) }));
const firstLineItem = raw.refund?.refund_line_items?.[0];
const hasShopSide = Boolean(firstLineItem?.subtotal_set?.shop_money);

// QUESTION 2 — `calculatedShopCents` needs this to judge a partial-refund cap in
// the merchant's currency. Without it the cap cannot be compared, and the
// default `guarded` tier sets maxRefundAmount to 50, so every international
// partial refund on a default workspace returns `cap_not_comparable`.
console.log(`\n  Q2: calculation line item carries shop_money? ${hasShopSide
  ? `YES — ${JSON.stringify(firstLineItem.subtotal_set)}`
  : 'NO — every international partial refund blocks as cap_not_comparable on a capped workspace'}`);

// QUESTION 3 — the refund mutations select `totalRefundedSet { shopMoney { amount
// currencyCode } }`. That is inferred from MoneyBag being the same type
// order-creation.ts already queries, never verified. Introspection settles it
// without committing a refund.
let introspectionError = null;
const introspection = await shopifyGraphql(ctx, `{
  moneyBag: __type(name: "MoneyBag") { fields { name } }
  refund: __type(name: "Refund") { fields { name type { name kind ofType { name } } } }
}`, {}).catch((err) => { introspectionError = err?.message ?? String(err); return null; });
const moneyBagFields = introspection?.moneyBag?.fields?.map((f) => f.name) ?? [];
const totalRefundedSet = introspection?.refund?.fields
  ?.find((f) => f.name === 'totalRefundedSet');
const refundedSetType = totalRefundedSet?.type?.name ?? totalRefundedSet?.type?.ofType?.name;
console.log(`\n  Q3: MoneyBag fields .............. ${moneyBagFields.join(', ') || `(introspection failed: ${introspectionError})`}`);
console.log(`      Refund.totalRefundedSet type . ${refundedSetType ?? '(not found)'}`);
console.log(`      verdict ...................... ${moneyBagFields.includes('shopMoney') && refundedSetType === 'MoneyBag'
  ? 'OK — the mutation selection is valid'
  : 'CHECK BY HAND — the refund mutation may fail on an invalid selection'}`);

await db.$disconnect();
