import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY / one-shot — backfill operator_key onto pre-Phase-B operator threads
// so the currently-deployed code resolves them via the fast path (the deployed
// resolveOperatorThread looks up by operator_key and, without this, tries to
// create a second open thread → violates threads_one_open_per_customer). The
// landed code fix does this lazily per binding; this cleans up all at once.
//
//   railway run bash -c 'NODE_ENV=production ORG_ID=<org> npx tsx apps/gateway/src/scripts/backfill-operator-keys.ts'
//
// Scoped to ORG_ID. Idempotent: only touches open sms_agent threads whose
// operator_key IS NULL and whose customer.platform_id is a binding key.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const orgId = process.env.ORG_ID ?? '10c25c34-7a92-4963-b9cd-537ef893f6c0'; // Palette

  const candidates = await db.$queryRawUnsafe<{ id: string; platform_id: string }[]>(
    `SELECT t.id, c.platform_id
       FROM threads t JOIN customers c ON c.id = t.customer_id
      WHERE t.organization_id = $1
        AND t.channel_type = 'sms_agent'
        AND t.status = 'open'
        AND t.operator_key IS NULL
        AND (c.platform_id LIKE 'imessage:%' OR c.platform_id LIKE 'telegram:%')`,
    orgId,
  );

  if (candidates.length === 0) {
    console.log('Nothing to backfill — no null-keyed operator threads.');
    await db.$disconnect();
    return;
  }

  for (const c of candidates) {
    await db.thread.update({ where: { id: c.id }, data: { operatorKey: c.platform_id } });
    console.log(`  set operator_key=${c.platform_id} on thread ${c.id}`);
  }
  console.log(`✅ Backfilled ${candidates.length} operator thread(s).`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
