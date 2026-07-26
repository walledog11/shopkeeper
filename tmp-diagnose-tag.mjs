// Read-only. Why did probeCreatedOrder report no_effect for an order that was
// demonstrably created? Three candidates, one run:
//   1. the tag never landed on the order        -> REST read shows no tags
//   2. Shopify's search index lagged the write  -> REST shows it, search finds it now
//   3. `tag:` needs quoting for a hyphenated value -> unquoted misses, quoted hits
import { loadLocalEnv } from '/Users/rajbirsambi/dev/shopkeeper/scripts/load-local-env.mjs';

loadLocalEnv();
const { db } = await import('@shopkeeper/db');
const { shopifyGraphql, shopifyRestJson } = await import('@shopkeeper/agent/shopify');

const ORDER_ID = '6122963337450';
const TAG = 'shopkeeper-op-34c58ba093d15c568d36af36';

const integration = await db.integration.findFirst({
  where: { platform: 'shopify', externalAccountId: { contains: 'palette-dev' } },
  select: { externalAccountId: true, accessToken: true },
});
if (!integration?.accessToken) throw new Error('No decryptable palette-dev integration.');
const ctx = { shop: integration.externalAccountId, accessToken: integration.accessToken };

const rest = await shopifyRestJson(ctx, `orders/${ORDER_ID}.json`, {
  query: { fields: 'id,name,tags,created_at' },
});

async function search(query) {
  const data = await shopifyGraphql(ctx, `
    query FindShopkeeperCreatedOrder($query: String!) {
      orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes { legacyResourceId name tags }
      }
    }
  `, { query });
  return (data.orders?.nodes ?? []).map((o) => ({ id: o.legacyResourceId, name: o.name, tags: o.tags }));
}

console.log(JSON.stringify({
  restRead: {
    name: rest.order?.name,
    tags: rest.order?.tags,
    tagStored: String(rest.order?.tags ?? '').includes(TAG),
    createdAt: rest.order?.created_at,
  },
  searchUnquoted: await search(`tag:${TAG}`),
  searchQuoted: await search(`tag:"${TAG}"`),
  searchByName: await search('name:#1007'),
}, null, 2));

await db.$disconnect();
