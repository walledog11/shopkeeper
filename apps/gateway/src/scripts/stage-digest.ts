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
// It seeds three open tickets — two `questionable` (1: "Sarah", a marketing
// blast; 2: a shipping question) plus one `genuine` that is deliberately NOT in
// pendingDigest.threadIds, so you can confirm mark_ticket_spam refuses to reach
// a healthy inbox ticket — then builds and pushes the digest through the
// production path (buildOrgDigest + notifyOperator), so OperatorContext
// .pendingDigest carries exactly the threadIds the merchant just read.
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
// Env knobs: ORG_ID (reuse an org instead of the fixture one), TELEGRAM_CHAT_ID
// (required until a binding exists), CLERK_USER_ID, ORG_NAME.
// Cleanup: the three fixture customers are in cleanup-livetest-data.ts's
// default email list, so `ORG_ID=… CONFIRM=1 tsx …/cleanup-livetest-data.ts`
// removes them (threads + messages cascade).

const FIXTURE_CLERK_ORG_ID = 'org_digest_livetest';
const MINUTE_MS = 60 * 1000;

interface Fixture {
  email: string;
  name: string;
  body: string;
  aiSummary: string;
  filterStatus: 'questionable' | 'genuine';
  filterReason: string | null;
  tag: string;
  /** Minutes back from now; controls the digest's flagged ordering. */
  ageMinutes: number;
}

// updatedAt desc drives both the digest list order and the pendingDigest
// threadIds order, so Sarah must be the freshest to land on index 1.
const FIXTURES: Fixture[] = [
  {
    email: 'livetest1@example.com',
    name: 'Sarah Whitcombe',
    body: "Hi there! I'm reaching out because I noticed your store could rank much higher on Google. We offer guaranteed first-page placement and 500 premium backlinks for a flat monthly fee. Reply INFO and I'll send our package deck. Best, Sarah",
    aiSummary: 'Unsolicited SEO/backlink marketing pitch — no order or customer history.',
    filterReason: 'Bulk marketing pitch, no order reference',
    tag: 'Other',
    filterStatus: 'questionable',
    ageMinutes: 10,
  },
  {
    email: 'livetest2@example.com',
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
    name: 'Priya Nadar',
    body: 'Do the linen napkins come in a darker olive? The photos look lighter than the swatch I saw at the market.',
    aiSummary: 'Customer asks whether the linen napkins come in a darker olive shade.',
    filterReason: null,
    tag: 'Product',
    filterStatus: 'genuine',
    ageMinutes: 30,
  },
];

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { buildOrgDigest } = await import('../maintenance/digest.js');
  const { listOperatorBindings, notifyOperator } = await import('../operator-notify.js');
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
  if (chatId) {
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
    await db.orgMemberTelegramChat.upsert({
      where: { chatId },
      update: { orgMemberId: member.id },
      create: { orgMemberId: member.id, chatId, displayName: 'A2 live test' },
    });
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
        aiSummary: fixture.aiSummary,
        tag: fixture.tag,
        filterStatus: fixture.filterStatus,
        filterReason: fixture.filterReason,
        lastMessageAt: sentAt,
        lastMessageSenderType: 'customer',
      },
      select: { id: true },
    });
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: orgId,
        senderType: 'customer',
        contentText: fixture.body,
        sentAt,
      },
    });
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

  const flaggedOrder = digest.pendingDigest.threadIds.map((id, index) => {
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
    const result = await notifyOperator(
      orgId,
      member,
      digest.message,
      { pendingDigest: digest.pendingDigest },
      { idempotencyKey },
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
