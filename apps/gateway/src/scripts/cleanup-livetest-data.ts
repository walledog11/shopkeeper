import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — remove ONLY the fake tickets seeded by this session's
// stage-pending-plan.ts runs (customers livetest1..5@example.com in the Palette
// org). Scoped to an explicit email list so it never touches other sessions'
// canary data (e.g. livetest+...-imessage / -p7c). Deleting the Customer
// cascades to its Threads and Messages (onDelete: Cascade);
// AgentAction/PlanExecution/KbCitation keep their audit rows with threadId
// nulled (onDelete: SetNull).
//
// Dry-run by default — prints what it would delete. Pass CONFIRM=1 to execute.
// Override the target set with EMAILS="a@example.com,b@example.com".
//
//   railway run bash -lc 'NODE_ENV=production ORG_ID=... npx tsx apps/gateway/src/scripts/cleanup-livetest-data.ts'          # dry run
//   railway run bash -lc 'NODE_ENV=production ORG_ID=... CONFIRM=1 npx tsx apps/gateway/src/scripts/cleanup-livetest-data.ts' # delete

async function main() {
  const { db } = await import('@shopkeeper/db');

  const orgId = process.env.ORG_ID;
  if (!orgId) throw new Error('Set ORG_ID');
  const confirm = process.env.CONFIRM === '1';
  const emails = (process.env.EMAILS
    ?? 'livetest1@example.com,livetest2@example.com,livetest3@example.com,livetest4@example.com,livetest5@example.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const customers = await db.customer.findMany({
    where: {
      organizationId: orgId,
      platformId: { in: emails },
    },
    select: {
      id: true,
      platformId: true,
      name: true,
      _count: { select: { threads: true } },
    },
  });

  if (customers.length === 0) {
    console.log('No livetest*@example.com customers in this org — nothing to clean up.');
    await db.$disconnect();
    return;
  }

  console.log(`Found ${customers.length} seeded test customer(s) in org ${orgId}:`);
  for (const c of customers) {
    console.log(`  ${c.platformId.padEnd(28)} ${c.id}  threads:${c._count.threads}  (${c.name ?? ''})`);
  }

  if (!confirm) {
    console.log('\nDRY RUN — nothing deleted. Re-run with CONFIRM=1 to delete these');
    console.log('customers (their threads + messages cascade; audit rows are kept, unlinked).');
    await db.$disconnect();
    return;
  }

  const { count } = await db.customer.deleteMany({
    where: {
      organizationId: orgId,
      platformId: { in: emails },
    },
  });
  console.log(`\n✅ Deleted ${count} customer(s); their threads and messages cascaded.`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
