import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

// THROWAWAY — dump one thread's cached plan: routing decision, warnings, the
// steps the merchant is shown, and the raw tool calls behind them.
//
// Written for the live storefront-chat run, to tell a *proposed* mutation from
// an executed one. A card saying "a return has been initiated" is a copy bug if
// the plan merely proposes create_return, and a hallucination if no such call is
// in the plan at all. AgentAction answers what ran; this answers what was
// planned, and only the pair distinguishes the two.
//
//   railway run bash -lc 'NODE_ENV=production THREAD_ID=... npx tsx apps/gateway/src/scripts/inspect-cached-plan.ts'

async function main() {
  const { db } = await import('@shopkeeper/db');

  const threadId = process.env.THREAD_ID;
  if (!threadId) throw new Error('Set THREAD_ID');

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true, channelType: true, cachedPlan: true, cachedPlanMessageId: true },
  });
  if (!thread) throw new Error(`No thread ${threadId}`);
  if (thread.cachedPlan == null) {
    console.log(`thread ${thread.id} (${thread.status}) has no cached plan.`);
    await db.$disconnect();
    return;
  }

  const cached = thread.cachedPlan as {
    plan?: {
      summary?: string;
      steps?: unknown[];
      warnings?: string[];
      rawToolCalls?: { id?: string; name?: string; input?: unknown }[];
      routing?: { decision?: string; question?: string | null };
    };
  };
  const plan = cached.plan ?? {};

  console.log(`thread ${thread.id}  status=${thread.status}  channel=${thread.channelType}`);
  console.log(`routing: ${plan.routing?.decision ?? '-'}`);
  console.log(`summary: ${plan.summary ?? '-'}\n`);

  console.log('steps:');
  for (const step of plan.steps ?? []) console.log(`  ${JSON.stringify(step)}`);

  console.log('\nraw tool calls:');
  for (const call of plan.rawToolCalls ?? []) {
    console.log(
      `  ${call.name}  id=${call.id}` +
      `${call.id === 'tu_route_escalate' ? '  <- ROUTER-MATERIALIZED' : ''}`,
    );
    console.log(`    input: ${JSON.stringify(call.input)}`);
  }

  if (plan.warnings?.length) {
    console.log('\nwarnings:');
    for (const w of plan.warnings) console.log(`  ${w}`);
  }

  await db.$disconnect();
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
