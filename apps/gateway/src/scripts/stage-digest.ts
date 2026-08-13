import { loadGatewayEnv } from '../config/load-env.js';

// Load env BEFORE importing anything that constructs the Anthropic/Prisma
// clients at module load — those capture process.env at construction, so the
// db + digest modules are dynamically imported inside main() below.
loadGatewayEnv();

// THROWAWAY — stage a support digest with flagged tickets so you can live-test
// the A2 digest-triage loop (dismiss spam / send a reply in prose, NOT via the
// `SPAM <n>` / `REPLY <n> <text>` fast paths) without waiting for the scheduled
// digest or for real flagged traffic.
//
// It seeds one open ticket per briefing outcome — two `questionable` (1: "Sarah",
// outreach that might be a customer; 2: a shipping question), one `genuine` that
// is deliberately NOT in pendingDigest.threadIds so you can confirm
// mark_ticket_spam refuses to reach a healthy inbox ticket, one `no_request`
// opener, and one `filtered` pitch — then builds and pushes the digest through
// the production path (buildOrgDigest + notifyOperator), so OperatorContext
// .pendingDigest carries exactly the threadIds the merchant just read.
//
// Keep every fixture's verdict one the classifier would plausibly reach for that
// body. This script is also how the briefing gets read before shipping copy, and
// a mislabelled fixture reads as a product bug: an obvious spam filed
// `questionable` prints under "I wasn't sure about", which is the briefing
// faithfully rendering a verdict no classifier would have returned.
//
// Local test DB + throwaway BotFather bot (the A2 harness; see the gateway
// server command in the printed next steps):
//
//   npm run build -w packages/db && npm run build -w packages/agent
//   PATH="$PWD/node_modules/.bin:$PATH" \
//     ANTHROPIC_API_KEY=sk-ant-… E2E_AI_MODE=live \
//     TELEGRAM_BOT_TOKEN=<throwaway-token> TELEGRAM_CHAT_ID=<your chat id> \
//     node scripts/with-test-env.mjs tsx apps/gateway/src/scripts/stage-digest.ts
//
// E2E_AI_MODE must not be `deterministic` (the with-test-env default) or the
// model is stubbed and the turn never reaches a tool.
//
// Env knobs: ORG_ID (reuse an org instead of the fixture one), CLERK_USER_ID,
// ORG_NAME, and one operator binding — TELEGRAM_CHAT_ID, or IMESSAGE_SENDER_ID
// plus IMESSAGE_SPACE_ID. Without one nothing is pushed and the briefing is only
// printed.
//
// The fixtures live in the local test DB, so nothing here touches a real inbox;
// only the outbound text is real. A reply to it will not work: it reaches
// whichever gateway owns that handle in production, which has no pendingDigest
// for these thread ids. This is a one-way check of what the briefing looks like.
// Cleanup: the three fixture customers are in cleanup-livetest-data.ts's
// default email list, so `ORG_ID=… CONFIRM=1 tsx …/cleanup-livetest-data.ts`
// removes them (threads + messages cascade).

const FIXTURE_CLERK_ORG_ID = 'org_digest_livetest';
const MINUTE_MS = 60 * 1000;

interface Fixture {
  email: string;
  name: string;
  body: string;
  /** The classifier writes one for every thread; fixtures without one exercise a
   *  summary-derived fallback that production almost never reaches. */
  aiTitle: string;
  aiSummary: string;
  filterStatus: 'questionable' | 'genuine' | 'filtered';
  filterReason: string | null;
  tag: string;
  /** Minutes back from now; controls the digest's flagged ordering. */
  ageMinutes: number;
  /** Classifier verdict: a real person who has not asked for anything yet. */
  noRequest?: boolean;
  /**
   * Cache a plan on the thread. Without one every fixture is a thread the agent
   * never worked, which is not what a morning looks like and leaves the approval
   * list — the section that matters most — out of the staged read entirely.
   *
   * Older than WAITING_PLAN_MIN_AGE_MS (3h) it lands in "waiting on your OK";
   * fresher than that it is a plan the merchant already got a card for, and it
   * falls to "Also open".
   */
  plan?: { tool: 'send_reply' | 'create_refund'; instruction: string; input: unknown };
}

// updatedAt desc drives both the digest list order and the pendingDigest
// threadIds order, so Sarah must be the freshest to land on index 1.
const FIXTURES: Fixture[] = [
  {
    // Genuinely ambiguous, which is the only thing `questionable` should mean:
    // this could be a shopper who likes the ceramics or a newsletter pitch, and
    // the honest thing is to ask. An unmistakable backlink blast belongs in the
    // filtered fixture below, where it is counted and never named.
    email: 'livetest1@example.com',
    aiTitle: 'Newsletter Tie-Up Or Customer',
    name: 'Sarah Whitcombe',
    body: "Hey! Love what you're doing with the ceramics line — the glazes are gorgeous. I write a small home-goods newsletter and thought there might be a fit here. Happy to send details, or I might just buy the mug set myself. Either way, nice work!",
    aiSummary: 'Compliments the ceramics line and floats a newsletter tie-up, while also mentioning buying the mug set.',
    filterReason: 'Unclear whether outreach or a customer; no order history',
    tag: 'Other',
    filterStatus: 'questionable',
    ageMinutes: 10,
  },
  {
    email: 'livetest2@example.com',
    aiTitle: 'Mug Set Not Shipped Yet',
    name: 'Marcus Reed',
    body: "hey — ordered the ceramic mug set last week and still no shipping email. when does it actually go out? starting to wonder if the order went through",
    aiSummary: 'Customer asks when their ceramic mug set order will ship — no tracking yet.',
    filterReason: 'First-time sender, no matching order found',
    tag: 'Shipping',
    filterStatus: 'questionable',
    ageMinutes: 90,
  },
  {
    email: 'livetest3@example.com',
    aiTitle: 'Darker Olive Linen Napkins',
    name: 'Priya Nadar',
    body: 'Do the linen napkins come in a darker olive? The photos look lighter than the swatch I saw at the market.',
    aiSummary: 'Customer asks whether the linen napkins come in a darker olive shade.',
    filterReason: null,
    tag: 'Product',
    filterStatus: 'genuine',
    ageMinutes: 30,
  },
  {
    email: 'livetest4@example.com',
    aiTitle: 'Single Word Opener',
    name: 'Dee Okafor',
    body: 'yo',
    aiSummary: 'Visitor wrote a single word: "yo".',
    filterReason: null,
    tag: 'General',
    filterStatus: 'genuine',
    ageMinutes: 45,
    // A real person who has not said what they want yet. The briefing must not
    // name this one anywhere — getting them to say more is the agent's job, and
    // a storefront produces a thousand of these a week.
    noRequest: true,
  },
  {
    // Rambles well past the width a quote can carry, so the handoff prints the
    // summary instead. The merchant must be able to act on this line alone.
    email: 'livetest6@example.com',
    aiTitle: 'Address Change Before Friday',
    name: 'Dana Ruiz',
    body: 'Hi! So sorry to be a pain about this, but I have just moved and I think I gave you the old address by mistake when I checked out last week. Could you send order 1043 to flat 4 instead? And will it still get here before Friday, or should I have it sent to my office?',
    aiSummary: 'Customer asks to move order #1043 to a new flat and whether it will still arrive before Friday.',
    filterReason: null,
    tag: 'Shipping',
    filterStatus: 'genuine',
    ageMinutes: 20,
  },
  {
    // The unmistakable one. It must never be named in the briefing — the whole
    // disclosure it earns is "I filed one as spam", because naming it asks the
    // merchant to re-read a decision the agent was right to make alone.
    email: 'livetest5@example.com',
    aiTitle: 'SEO Backlink Package Pitch',
    name: 'Growth Partners',
    body: "Hi there! I'm reaching out because I noticed your store could rank much higher on Google. We offer guaranteed first-page placement and 500 premium backlinks for a flat monthly fee. Reply INFO and I'll send our package deck.",
    aiSummary: 'Unsolicited SEO/backlink marketing pitch — no order or customer history.',
    filterReason: 'Bulk marketing pitch, no order reference',
    tag: 'Other',
    filterStatus: 'filtered',
    ageMinutes: 60,
  },
  {
    // Second filtered one, so the spam line has to count rather than say "one".
    email: 'livetest7@example.com',
    aiTitle: 'Home Styling Newsletter',
    name: 'Nordic Home Weekly',
    body: 'NORDIC HOME WEEKLY — Issue 214. Inside: five ways to style open shelving, our editor picks for spring, and 20% off at our partner stores. View in browser. Unsubscribe.',
    aiSummary: 'Marketing newsletter with styling tips and partner discounts.',
    filterReason: 'Newsletter broadcast, unsubscribe footer',
    tag: 'Other',
    filterStatus: 'filtered',
    ageMinutes: 200,
  },
  {
    // Money, drafted and parked. Leads the approval list because an amount is
    // the one thing worth reading before a name.
    email: 'livetest8@example.com',
    aiTitle: 'Two Cracked Mugs, Refund Asked',
    name: 'Tomás Herrera',
    body: 'Two of the four mugs turned up cracked — looks like they shifted in transit, the box was fine. I do not need replacements, I would just like the two refunded if that is alright.',
    aiSummary: 'Customer reports two of four mugs arrived cracked and asks for a refund on those two rather than replacements.',
    filterReason: null,
    tag: 'Returns',
    filterStatus: 'genuine',
    ageMinutes: 300,
    plan: {
      tool: 'create_refund',
      instruction: 'Refund the two cracked mugs',
      input: { order_id: 'gid://shopify/Order/1049', amount: 34, currency: 'USD' },
    },
  },
  {
    email: 'livetest9@example.com',
    aiTitle: 'No Delivery Update Since Tuesday',
    name: 'Aisha Bello',
    body: 'Morning! Any update on order 1051? It said out for delivery on Tuesday and nothing since.',
    aiSummary: 'Customer asks for an update on order #1051, which showed out for delivery on Tuesday.',
    filterReason: null,
    tag: 'Order Status',
    filterStatus: 'genuine',
    ageMinutes: 260,
    plan: {
      tool: 'send_reply',
      instruction: 'Answer the delivery question for order 1051',
      input: { text: 'It is with the courier and due tomorrow.' },
    },
  },
  {
    // Fresh plan: the merchant already got a card, so this is not re-asked. It
    // is the only thing left in "Also open" now the other states are split out.
    email: 'livetest10@example.com',
    aiTitle: 'Ireland Shipping And Customs',
    name: 'Ravi Patel',
    body: 'Do you ship to Ireland, and is there a customs charge on top?',
    aiSummary: 'Customer asks whether the store ships to Ireland and whether customs charges apply.',
    filterReason: null,
    tag: 'Shipping',
    filterStatus: 'genuine',
    ageMinutes: 25,
    plan: {
      tool: 'send_reply',
      instruction: 'Answer the Ireland shipping question',
      input: { text: 'We do ship to Ireland, three to five days.' },
    },
  },
  {
    // A complaint, not a question: the handoff must say "wrote", not "asked".
    email: 'livetest11@example.com',
    aiTitle: 'Second Late Order In A Row',
    name: 'Greta Lindqvist',
    body: 'This is the second order in a row that has turned up late. I am starting to lose patience with it, to be honest.',
    aiSummary: 'Customer complains that a second consecutive order arrived late and is losing patience.',
    filterReason: null,
    tag: 'Shipping',
    filterStatus: 'genuine',
    ageMinutes: 150,
  },
];

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { buildAgentPlanCacheRecord } = await import('@shopkeeper/agent/plan-cache');
  const { resolveAgentSettings } = await import('@shopkeeper/agent/settings');
  const { PLAN_STEP_LABELS } = await import('@shopkeeper/agent/tools');
  const { buildOrgDigest, deliverOrgDigest } = await import('../maintenance/digest.js');
  const { listOperatorBindings } = await import('../operator-notify.js');
  const { digestNotificationIdempotencyKey } = await import('../operator-notify-idempotency.js');

  const now = new Date();

  let orgId = process.env.ORG_ID ?? undefined;
  if (!orgId) {
    const org = await db.organization.upsert({
      where: { clerkOrgId: FIXTURE_CLERK_ORG_ID },
      update: {},
      create: {
        clerkOrgId: FIXTURE_CLERK_ORG_ID,
        name: process.env.ORG_NAME ?? 'Digest Live Test',
        settings: { agentName: 'Ada', digestEnabled: true },
      },
      select: { id: true },
    });
    orgId = org.id;
  }

  // send_ticket_reply hops to the dashboard, which refuses to send without a
  // resolvable email integration. One `platform: 'email'` row is enough — it
  // self-repairs as the org default — and E2E_OUTBOUND_MODE=record intercepts
  // the send before any provider call, so no real mail leaves.
  await db.integration.upsert({
    where: { organizationId_emailProvider: { organizationId: orgId, emailProvider: 'postmark' } },
    update: {},
    create: {
      organizationId: orgId,
      platform: 'email',
      emailProvider: 'postmark',
      externalAccountId: 'support-digest-livetest@inbound.test',
      fromEmail: 'support-digest-livetest@inbound.test',
      accessToken: 'livetest-postmark-token',
    },
  });

  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  // iMessage is the other operator channel and the one most merchants are
  // actually bound on, so the harness has to be able to reach it too. Copy the
  // handle and space from wherever the real binding lives:
  //   IMESSAGE_SENDER_ID=<handle> IMESSAGE_SPACE_ID=<space> node scripts/…
  const imessageSenderId = process.env.IMESSAGE_SENDER_ID?.trim();
  const imessageSpaceId = process.env.IMESSAGE_SPACE_ID?.trim();

  if (chatId || (imessageSenderId && imessageSpaceId)) {
    const member = await db.orgMember.upsert({
      where: {
        organizationId_clerkUserId: {
          organizationId: orgId,
          clerkUserId: process.env.CLERK_USER_ID ?? 'user_digest_livetest',
        },
      },
      update: {},
      create: {
        organizationId: orgId,
        clerkUserId: process.env.CLERK_USER_ID ?? 'user_digest_livetest',
      },
      select: { id: true },
    });
    if (chatId) {
      await db.orgMemberTelegramChat.upsert({
        where: { chatId },
        update: { orgMemberId: member.id },
        create: { orgMemberId: member.id, chatId, displayName: 'A2 live test' },
      });
    }
    if (imessageSenderId && imessageSpaceId) {
      await db.orgMemberImessageBinding.upsert({
        where: { senderId: imessageSenderId },
        update: { orgMemberId: member.id, spaceId: imessageSpaceId },
        create: {
          orgMemberId: member.id,
          senderId: imessageSenderId,
          spaceId: imessageSpaceId,
          displayName: 'A2 live test',
        },
      });
    }
  }

  // Drop any earlier run's fixtures first: an org can hold only one open thread
  // per (customer, channel), so re-staging would otherwise collide.
  await db.customer.deleteMany({
    where: { organizationId: orgId, platformId: { in: FIXTURES.map((f) => f.email) } },
  });

  const staged: Array<{ fixture: Fixture; threadId: string }> = [];
  for (const fixture of FIXTURES) {
    const sentAt = new Date(now.getTime() - fixture.ageMinutes * MINUTE_MS);
    const customer = await db.customer.create({
      data: { organizationId: orgId, platformId: fixture.email, name: fixture.name },
      select: { id: true },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        subject: fixture.tag === 'Other' ? 'Partnership opportunity' : `Re: ${fixture.tag}`,
        aiTitle: fixture.aiTitle,
        aiSummary: fixture.aiSummary,
        tag: fixture.tag,
        filterStatus: fixture.filterStatus,
        filterReason: fixture.filterReason,
        // The spam count reports what was filed since the last briefing, so a
        // filtered thread with no decision timestamp is not counted at all.
        filterDecidedAt: fixture.filterStatus === 'genuine' ? null : sentAt,
        classifierSignals: {
          version: 3,
          language: 'en',
          intents: { no_request: fixture.noRequest === true },
        },
        lastMessageAt: sentAt,
        lastMessageSenderType: 'customer',
      },
      select: { id: true },
    });
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: orgId,
        senderType: 'customer',
        contentText: fixture.body,
        sentAt,
      },
      select: { id: true },
    });

    if (fixture.plan) {
      // cachedPlanMessageId must be the newest customer message or the plan is
      // stale by definition and getCurrentPlanForThread drops it.
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: buildAgentPlanCacheRecord({
            instruction: fixture.plan.instruction,
            plan: {
              instruction: fixture.plan.instruction,
              steps: [{
                id: 'step-1',
                tool: fixture.plan.tool,
                label: PLAN_STEP_LABELS[fixture.plan.tool] ?? fixture.plan.tool,
                description: fixture.plan.instruction,
                category: fixture.plan.tool === 'create_refund' ? 'action' : 'communication',
                enabled: true,
              }],
              rawToolCalls: [{ id: 'step-1', name: fixture.plan.tool, input: fixture.plan.input }],
            },
            lastCustomerMessageId: message.id,
            settings: resolveAgentSettings(null),
          }) as never,
          cachedPlanMessageId: message.id,
        },
      });
    }
    staged.push({ fixture, threadId: thread.id });
  }

  // Prisma's @updatedAt overwrites whatever the writes above left behind, so pin
  // updated_at directly — the digest's flagged order depends on it.
  for (const { fixture, threadId } of staged) {
    const updatedAt = new Date(now.getTime() - fixture.ageMinutes * MINUTE_MS);
    await db.$executeRaw`UPDATE threads SET updated_at = ${updatedAt} WHERE id = ${threadId}::uuid`;
  }

  const orgSettings = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { settings: true },
  });
  const digest = await buildOrgDigest(orgId, now, (orgSettings.settings as Record<string, unknown> | null) ?? {});
  if (!digest) {
    console.error('buildOrgDigest returned null — the fixture threads did not land as open tickets.');
    await db.$disconnect();
    process.exit(1);
  }

  // Print the text itself, before the binding check bails. Composition is the
  // thing most likely to be wrong here and it can only be judged by reading it,
  // which otherwise needs a bound phone.
  console.log(`\n${'─'.repeat(52)}\n${digest.message}\n${'─'.repeat(52)}\n`);

  const flaggedOrder = digest.pendingDigest.threadIds.map((id: string, index: number) => {
    const match = staged.find((s) => s.threadId === id);
    return `  ${index + 1}. ${match?.fixture.name ?? 'unknown'}  ${id}`;
  });

  const bindings = await listOperatorBindings(orgId);
  if (bindings.length === 0) {
    console.error('⚠️  No operator channel is bound to this org — nothing was pushed and');
    console.error('    pendingDigest was NOT parked. Message the bot once, read the chatId from');
    console.error('    the gateway\'s "[Telegram] Unbound sender" log, then re-run with');
    console.error('    TELEGRAM_CHAT_ID=<chatId>.');
    console.error('    org:', orgId);
    console.error('    flagged (staged, unsent):');
    for (const line of flaggedOrder) console.error(`  ${line}`);
    await db.$disconnect();
    process.exit(1);
  }

  const idempotencyKey = digestNotificationIdempotencyKey(orgId, digest.pendingDigest.sentAt);
  let delivered = 0;
  for (const member of bindings) {
    const result = await deliverOrgDigest(
      orgId,
      member,
      digest,
      idempotencyKey,
    );
    if (result) delivered++;
  }

  console.log(`✅ Staged a digest with ${digest.flaggedCount} flagged ticket(s) and pushed it to ${delivered}/${bindings.length} operator channel(s).`);
  console.log('   org:    ', orgId);
  console.log('   flagged (the order the model and the merchant both see):');
  for (const line of flaggedOrder) console.log(line);
  const genuine = staged.find((s) => s.fixture.filterStatus === 'genuine');
  console.log('   genuine (NOT in pendingDigest — mark_ticket_spam must refuse it):');
  console.log(`     ${genuine?.fixture.name}  ${genuine?.threadId}`);
  console.log('');
  // start.ts spawns ./index.js and ./worker.js, so it only resolves from dist —
  // run both entrypoints directly under tsx. The worker is not optional: durable
  // operator events are the only inbound path, so nothing is interpreted without
  // it. The dashboard serves the send_ticket_reply hop.
  console.log('Serve the webhook half (separate shells), then reply from your phone:');
  console.log('   cloudflared tunnel --url http://localhost:8180');
  console.log('   node ../../scripts/with-test-env.mjs npx next dev -p 3100      # from apps/dashboard');
  console.log('   ANTHROPIC_API_KEY=… E2E_AI_MODE=live PATH="$PWD/node_modules/.bin:$PATH" \\');
  console.log('     node scripts/with-test-env.mjs tsx apps/gateway/src/index.ts   # server :8180');
  console.log('   …same env… node scripts/with-test-env.mjs tsx apps/gateway/src/worker.ts');
  console.log('');
  console.log('A2 script — both replies must reach the model, not the fast path:');
  console.log('   "the one from Sarah is spam"        → mark_ticket_spam on flagged 1');
  console.log('   "reply to the second: we ship Friday" → send_ticket_reply on flagged 2');
  console.log('Confirm in the gateway log + AgentAction rows, not just the text reply.');

  // notifyOperator's idempotency marker holds an open ioredis connection that
  // $disconnect does not own, so the process would otherwise hang after the
  // digest is already delivered.
  await db.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  const { db } = await import('@shopkeeper/db').catch(() => ({ db: null }));
  await db?.$disconnect().catch(() => {});
  process.exit(1);
});
