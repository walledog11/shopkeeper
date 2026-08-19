import { db } from '@shopkeeper/db';

type Call = { id?: string; name?: string };

async function main() {
  // Filtered in JS rather than the query: `cachedPlan` is a Json column, so
  // `{ not: null }` needs Prisma.DbNull, and the db package exports Prisma as a
  // type only.
  const recent = await db.thread.findMany({
    select: { id: true, channelType: true, subject: true, status: true, cachedPlan: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  const threads = recent.filter((t) => t.cachedPlan != null);
  console.log(`threads with a cached plan: ${threads.length} (of ${recent.length} recent)`);

  let routerMaterialized = 0;
  for (const t of threads) {
    const plan = (t.cachedPlan as { plan?: { rawToolCalls?: Call[]; routing?: { decision?: string } } } | null)?.plan;
    const calls = plan?.rawToolCalls ?? [];
    const esc = calls.find((c) => c.name === 'escalate_to_human');
    if (!esc) continue;
    const isRouter = esc.id === 'tu_route_escalate';
    const hasReply = calls.some((c) => c.name === 'send_reply');
    if (isRouter) routerMaterialized += 1;
    console.log(
      `  ${t.updatedAt.toISOString()} | ${t.channelType} | ${t.status} | ` +
      `escalate=${isRouter ? 'ROUTER-MATERIALIZED' : 'model-elected'} | reply=${hasReply ? 'KEPT' : 'none'} | ` +
      `routing=${plan?.routing?.decision ?? '-'} | ${JSON.stringify(t.subject)}`
    );
  }
  console.log(`\nrouter-materialized escalations found: ${routerMaterialized}`);
  await db.$disconnect();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
