import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — list every Shopify integration in the DB and, for each, the
// webhook subscriptions Shopify currently holds for that shop. Diagnoses the
// "50% webhook failure rate" report on the shopkeeper-production app.

async function main() {
  const { db } = await import('@shopkeeper/db');

  const integrations = await db.integration.findMany({
    where: { platform: 'shopify' },
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

  console.log(`Shopify integrations: ${integrations.length}\n`);

  for (const row of integrations) {
    console.log('='.repeat(78));
    console.log(
      `shop=${row.externalAccountId}  org=${row.organizationId} (${row.organization?.name ?? '?'})`,
    );
    console.log(`  integrationId=${row.id} created=${row.createdAt.toISOString()}`);

    if (!row.accessToken || !row.externalAccountId) {
      console.log('  !! missing token or shop domain — skipping API call');
      continue;
    }

    try {
      const res = await fetch(
        `https://${row.externalAccountId}/admin/api/2026-04/webhooks.json?limit=250`,
        { headers: { 'X-Shopify-Access-Token': row.accessToken } },
      );
      if (!res.ok) {
        console.log(`  !! webhooks.json ${res.status}: ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      const body = (await res.json()) as {
        webhooks?: Array<{
          id: number;
          topic: string;
          address: string;
          created_at: string;
          updated_at: string;
          api_version?: string;
        }>;
      };
      const hooks = body.webhooks ?? [];
      console.log(`  subscriptions: ${hooks.length}`);
      const byTopic = new Map<string, typeof hooks>();
      for (const h of hooks) {
        const list = byTopic.get(h.topic) ?? [];
        list.push(h);
        byTopic.set(h.topic, list);
      }
      for (const [topic, list] of [...byTopic.entries()].sort()) {
        const dupe = list.length > 1 ? `  <-- ${list.length} SUBSCRIPTIONS` : '';
        console.log(`   ${topic}${dupe}`);
        for (const h of list) {
          console.log(
            `      id=${h.id} api=${h.api_version ?? '?'} created=${h.created_at} address=${h.address}`,
          );
        }
      }
    } catch (err) {
      console.log(`  !! fetch failed: ${(err as Error).message}`);
    }
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
