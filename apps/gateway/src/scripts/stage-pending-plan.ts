import { loadGatewayEnv } from '../config/load-env.js';

// Load env BEFORE importing anything that constructs the Anthropic/Prisma
// clients at module load — those capture process.env at construction, so the
// db + agent modules are dynamically imported inside main() below.
loadGatewayEnv();

// THROWAWAY — stage a pending operator plan so you can live-test the
// operator-channel interpretation loop (approve / revise / answer / leave
// untouched) WITHOUT routing a real customer message through a channel.
//
// It seeds a fake support ticket, generates + caches a real plan (no side
// effects), then parks + pushes it via the production notification path — the
// same calls the inbound flow uses, so OperatorContext.pendingPlan includes the
// stable identity required to resolve that plan across every bound device. A
// card lands on every bound operator channel; reply from your phone and watch
// which control tool fires.
//
// Run from the repo root with the gateway service linked in Railway (so prod
// env is injected — ANTHROPIC_API_KEY, DATABASE_URL, TELEGRAM_BOT_TOKEN, …):
//
//   npm run build -w packages/db && npm run build -w packages/agent
//   railway run bash -lc 'NODE_ENV=production npx tsx apps/gateway/src/scripts/stage-pending-plan.ts'
//
// Optional env knobs: ORG_ID, PROMPT, CUSTOMER_EMAIL, CUSTOMER_NAME.
// Deletes nothing — it prints the created thread/customer ids so you can clean
// up afterward.

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { generateThreadPlan } = await import('../message-handlers/generate-thread-plan.js');
  const { sendOperatorPlanNotification } = await import('../message-handlers/planning-notifications.js');
  const { listOperatorBindings } = await import('../operator-notify.js');

  const prompt = process.env.PROMPT
    ?? 'Hi! The candle I ordered smells amazing — thank you! Any tips for making it burn evenly and last longer? — Sarah';
  const customerEmail = process.env.CUSTOMER_EMAIL ?? 'livetest@example.com';
  const customerName = process.env.CUSTOMER_NAME ?? 'Sarah (live test)';

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

  const customer = await db.customer.upsert({
    where: { organizationId_platformId: { organizationId: orgId, platformId: customerEmail } },
    update: { name: customerName },
    create: { organizationId: orgId, platformId: customerEmail, name: customerName },
  });

  const aiSummary = 'Customer is happy with a candle order and asks for burn/longevity tips.';
  const thread = await db.thread.create({
    data: {
      organizationId: orgId,
      customerId: customer.id,
      channelType: 'email',
      status: 'open',
      subject: 'Live interpretation test',
      aiSummary,
      tag: 'Support',
    },
  });

  const sourceMessage = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: orgId,
      senderType: 'customer',
      contentText: prompt,
    },
  });
  await db.thread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), lastMessageSenderType: 'customer' },
  });

  const instruction = "Handle this customer's latest request";
  const generated = await generateThreadPlan(orgId, thread.id, false, {
    instruction,
    sourceMessageId: sourceMessage.id,
  });
  const plan = generated.plan;

  if (!plan || plan.rawToolCalls.length === 0 || !generated.identity) {
    console.error('Planner produced no actionable tool calls — try a different PROMPT');
    console.error('  (one that yields a reply/refund, not a "no action needed" plan).');
    console.error('  thread:', thread.id, ' customer:', customer.id, '(delete these before retrying)');
    await db.$disconnect();
    process.exit(1);
  }

  const bindings = await listOperatorBindings(orgId);
  if (bindings.length === 0) {
    console.error('⚠️  No operator channel is bound to this org — nothing was pushed and');
    console.error('    pendingPlan was NOT parked. Bind Telegram or iMessage first, then re-run.');
    console.error('    thread:', thread.id, ' customer:', customer.id, '(delete these before retrying)');
    await db.$disconnect();
    process.exit(1);
  }

  await sendOperatorPlanNotification(
    orgId,
    thread.id,
    customerName,
    'email',
    aiSummary,
    plan,
    instruction,
    { identity: generated.identity },
  );

  console.log(`✅ Staged a pending plan and pushed it to ${bindings.length} operator channel(s).`);
  console.log('   org:      ', orgId);
  console.log('   thread:   ', thread.id, '(email · "Live interpretation test")');
  console.log('   customer: ', customer.id, `(${customerEmail})`);
  console.log('   steps:    ', JSON.stringify(plan.steps));
  console.log('   toolCalls:', plan.rawToolCalls.map((t) => t.name).join(', '));
  console.log('');
  console.log('Reply from your phone and confirm the routing (watch Railway logs + AgentAction):');
  console.log('  "yes send it"     → approve_pending_plan  (executes the shown draft verbatim to the test customer)');
  console.log('  "make it warmer"  → revise_pending_plan   (a NEW card should arrive; nothing sent)');
  console.log('  an unrelated ask  → pending plan stays parked, untouched');
  console.log('');
  console.log('Cleanup later:  delete thread', thread.id, 'and customer', customer.id);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
