import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// What `end_flash_sale` sees when the merchant asks what is running, read from
// the live store. Stubbed tests grade the parser, never the request, so they
// cannot see a Shopify query that returns the wrong set — which is how
// `query: "type:automatic"` shipped matching nothing on every store and told a
// merchant a live sale was over. This is the only cover that layer has.
//
//   railway run npx tsx apps/gateway/src/scripts/inspect-flash-sales.ts

const RAW_QUERY = `query flashSalesRaw($first: Int!) {
  automaticDiscountNodes(first: $first) {
    nodes {
      id
      automaticDiscount {
        __typename
        ... on DiscountAutomaticBasic { title status startsAt endsAt }
        ... on DiscountAutomaticBxgy { title status startsAt endsAt }
        ... on DiscountAutomaticFreeShipping { title status startsAt endsAt }
      }
    }
  }
}`;

interface RawNode {
  id?: string | null;
  automaticDiscount?: {
    __typename?: string | null;
    title?: string | null;
    status?: string | null;
    endsAt?: string | null;
  } | null;
}

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { listFlashSales, shopifyGraphql } = await import('@shopkeeper/agent/shopify');

  const integration = await db.integration.findFirst({
    where: { platform: 'shopify' },
    select: { externalAccountId: true, accessToken: true },
  });
  if (!integration?.accessToken) {
    console.log('No Shopify integration connected.');
    await db.$disconnect();
    return;
  }
  const ctx = { shop: integration.externalAccountId, accessToken: integration.accessToken };
  console.log(`shop: ${integration.externalAccountId}\n`);

  const raw = await shopifyGraphql<{ automaticDiscountNodes?: { nodes?: (RawNode | null)[] | null } }>(
    ctx,
    RAW_QUERY,
    { first: 25 },
  );
  const nodes = raw.automaticDiscountNodes?.nodes ?? [];
  console.log(`── every automatic discount on the store (${nodes.length}) ──`);
  for (const node of nodes) {
    const discount = node?.automaticDiscount;
    console.log(
      `  ${discount?.status ?? '?'}  ${discount?.__typename ?? '?'}  `
      + `${discount?.title ?? '(no title on this type)'}  ${node?.id ?? '?'}`,
    );
  }

  const running = await listFlashSales(ctx);
  console.log(`\n── what end_flash_sale reports as running (${running.length}) ──`);
  for (const sale of running) {
    console.log(`  ${sale.title}  ${sale.id}${sale.endsAt ? `  ends ${sale.endsAt}` : ''}`);
  }
  if (running.length === 0) {
    console.log('  (none — correct only if nothing above reads ACTIVE)');
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
