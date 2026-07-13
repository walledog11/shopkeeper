import { loadGatewayEnv } from '../config/load-env.js';

// Load env before importing the Prisma client (it captures process.env at
// construction), so db is dynamically imported inside main() below.
loadGatewayEnv();

// THROWAWAY companion to stage-pending-plan.ts — print the operator pending
// state (OperatorContext) and the most recent agent actions for an org, so you
// can confirm which control tool fired between phone replies without digging
// through logs.
//
//   railway run bash -lc 'NODE_ENV=production npx tsx apps/gateway/src/scripts/peek-operator-state.ts'
//
// Optional: ORG_ID, ACTIONS (row count, default 8).

async function main() {
  const { db } = await import('@shopkeeper/db');

  let orgId = process.env.ORG_ID ?? undefined;
  if (!orgId) {
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    if (orgs.length !== 1) {
      throw new Error(
        `Set ORG_ID — found ${orgs.length} orgs: ${orgs.map((o) => `${o.id} (${o.name})`).join(', ')}`,
      );
    }
    orgId = orgs[0].id;
  }

  const limit = Number(process.env.ACTIONS ?? 8);

  const contexts = await db.operatorContext.findMany({
    where: { organizationId: orgId },
    orderBy: { updatedAt: 'desc' },
  });

  console.log('── Pending state (OperatorContext) ─────────────────────────────');
  if (contexts.length === 0) {
    console.log('  (none — no operator has interacted yet)');
  }
  for (const c of contexts) {
    const plan = c.pendingPlan as { threadId?: string; instruction?: string } | null;
    const question = c.pendingQuestion as { question?: string } | null;
    const digest = c.pendingDigest as unknown;
    console.log(`  chatId ${c.chatId}  (updated ${c.updatedAt.toISOString()})`);
    console.log(`    pendingPlan:     ${plan ? `thread ${plan.threadId} — "${plan.instruction ?? ''}"` : '—'}`);
    console.log(`    pendingQuestion: ${question ? `"${question.question ?? JSON.stringify(question)}"` : '—'}`);
    console.log(`    pendingDigest:   ${digest ? 'set' : '—'}`);
  }

  const actions = await db.agentAction.findMany({
    where: { organizationId: orgId },
    orderBy: { executedAt: 'desc' },
    take: limit,
  });

  console.log('');
  console.log(`── Last ${actions.length} agent actions (newest first) ─────────────────────`);
  for (const a of actions) {
    const when = a.executedAt.toISOString().replace('T', ' ').slice(0, 19);
    const summary = a.summary ? ` · ${a.summary.slice(0, 60)}` : '';
    console.log(`  ${when}  ${a.tool.padEnd(24)} ${a.status.padEnd(8)} ${a.mode}${summary}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
