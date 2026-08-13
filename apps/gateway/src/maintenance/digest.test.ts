import { afterEach, describe, it, expect } from 'vitest';
import { db, ThreadFilterStatus } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestMessage, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { bucketDigestThreads, buildOrgDigest, digestWindowKey, formatDigestMessage, formatWeeklySummaryLine } from './digest.js';
import type { BriefingItem } from './digest-briefing.js';

const NOW = new Date('2026-04-29T12:00:00Z');
const HOUR = 3_600_000;
// Stands in for the last-briefing cursor: the spam count reports what was filed
// since then, not every filtered thread still sitting open.
const FILED_SINCE = new Date(NOW.getTime() - 24 * HOUR);

function makeThread(overrides: Partial<{
  id: string;
  filterStatus: 'genuine' | 'questionable' | 'filtered';
  ageHours: number;
  filterDecidedAt: Date | null;
  tag: string | null;
  customerName: string | null;
  channelType: string;
  aiTitle: string | null;
  aiSummary: string | null;
  filterReason: string | null;
  noRequest: boolean;
}> = {}) {
  const ageHours = overrides.ageHours ?? 1;
  return {
    id: overrides.id ?? `t-${Math.random().toString(16).slice(2)}`,
    updatedAt: new Date(NOW.getTime() - ageHours * HOUR),
    tag: overrides.tag === undefined ? 'Support' : overrides.tag,
    channelType: overrides.channelType ?? 'email',
    aiTitle: overrides.aiTitle ?? null,
    filterStatus: (overrides.filterStatus ?? ThreadFilterStatus.genuine) as 'genuine' | 'questionable' | 'filtered',
    filterDecidedAt: overrides.filterDecidedAt === undefined
      ? new Date(NOW.getTime() - ageHours * HOUR)
      : overrides.filterDecidedAt,
    aiSummary: overrides.aiSummary ?? null,
    filterReason: overrides.filterReason ?? null,
    customer: { name: overrides.customerName === undefined ? 'Jane' : overrides.customerName },
    cachedPlan: null,
    cachedPlanMessageId: null,
    messages: [],
    classifierSignals: overrides.noRequest
      ? { version: 3, language: 'en', intents: { no_request: true } }
      : null,
  };
}

// What the classifier persists for "hello" / "yo" / "Test": a real person who
// has not said what they want yet.
const NO_REQUEST_SIGNALS = { version: 3, language: 'en', intents: { no_request: true } };

// createTestMessage stamps sentAt from the clock, so two messages written in the
// same millisecond fall back to the `id desc` tiebreak — a random UUID order,
// which decides whether a thread reads as answered or as blocked. Any fixture
// with more than one message has to pin the order it means.
async function sentAtMinutesAgo(messageId: string, minutes: number) {
  await db.message.update({
    where: { id: messageId },
    data: { sentAt: new Date(NOW.getTime() - minutes * 60_000) },
  });
}

function replyPlanCache(instruction: string, lastCustomerMessageId: string) {
  return buildAgentPlanCacheRecord({
    instruction,
    plan: {
      instruction,
      steps: [{
        id: 'step-1',
        tool: 'send_reply',
        label: 'Send reply',
        description: 'Send reply',
        category: 'communication',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'send_reply', input: { text: 'On its way.' } }],
    },
    lastCustomerMessageId,
    settings: resolveAgentSettings(null),
  });
}

// The blank-line-separated block of the briefing that names this thread. Which
// heading a ticket sits under is the whole point of the sections, so asserting
// the message merely contains both strings would pass on the bug.
function sectionFor(message: string, needle: string): string {
  const block = message.split('\n\n').find((part) => part.includes(needle));
  if (!block) throw new Error(`Briefing never mentions "${needle}":\n${message}`);
  return block;
}

describe('bucketDigestThreads', () => {
  it('splits threads into genuine / questionable / filtered buckets', () => {
    const threads = [
      makeThread({ filterStatus: 'genuine' }),
      makeThread({ filterStatus: 'genuine' }),
      makeThread({ filterStatus: 'questionable' }),
      makeThread({ filterStatus: 'filtered' }),
      makeThread({ filterStatus: 'filtered' }),
    ];
    const b = bucketDigestThreads(threads, NOW, FILED_SINCE);
    expect(b.genuine).toHaveLength(2);
    expect(b.questionable).toHaveLength(1);
    expect(b.filteredCount).toBe(2);
  });

  it('counts urgent / stale / fresh only against genuine threads', () => {
    const threads = [
      makeThread({ filterStatus: 'genuine', ageHours: 30 }),  // urgent
      makeThread({ filterStatus: 'genuine', ageHours: 10 }),  // stale
      makeThread({ filterStatus: 'genuine', ageHours: 1 }),   // fresh
      makeThread({ filterStatus: 'questionable', ageHours: 30 }), // does NOT count
      makeThread({ filterStatus: 'filtered', ageHours: 30 }),     // does NOT count
    ];
    const b = bucketDigestThreads(threads, NOW, FILED_SINCE);
    expect(b.urgent).toBe(1);
    expect(b.stale).toBe(1);
    expect(b.fresh).toBe(1);
  });

  it('builds top tags from genuine threads only, sorted desc', () => {
    const threads = [
      makeThread({ filterStatus: 'genuine', tag: 'Refund' }),
      makeThread({ filterStatus: 'genuine', tag: 'Refund' }),
      makeThread({ filterStatus: 'genuine', tag: 'Shipping' }),
      makeThread({ filterStatus: 'questionable', tag: 'Spam' }), // ignored for tags
    ];
    const b = bucketDigestThreads(threads, NOW, FILED_SINCE);
    expect(b.topTags).toBe('Refund (2) · Shipping (1)');
  });

  it('counts only spam filed since the last briefing, not every filtered thread still open', () => {
    // Nothing closes a filtered thread, so without the window the same spam is
    // re-reported every morning and the number ratchets up all week.
    const threads = [
      makeThread({ filterStatus: 'filtered', ageHours: 2 }),
      makeThread({ filterStatus: 'filtered', ageHours: 40 }),
      makeThread({ filterStatus: 'filtered', ageHours: 70 }),
      // Filtered before the classifier recorded a decision: not evidence of
      // recent work, so not claimed as any.
      makeThread({ filterStatus: 'filtered', ageHours: 2, filterDecidedAt: null }),
    ];
    expect(bucketDigestThreads(threads, NOW, FILED_SINCE).filteredCount).toBe(1);
  });

  it('returns zero counts when no threads provided', () => {
    const b = bucketDigestThreads([], NOW, FILED_SINCE);
    expect(b.genuine).toEqual([]);
    expect(b.questionable).toEqual([]);
    expect(b.filteredCount).toBe(0);
    expect(b.urgent + b.stale + b.fresh).toBe(0);
    expect(b.topTags).toBe('');
  });
});

describe('formatDigestMessage', () => {
  const item = (over: Partial<BriefingItem> = {}): BriefingItem => ({
    threadId: `t-${Math.random().toString(16).slice(2)}`,
    kind: 'approval',
    line: 'Sarah — $12 refund · Damaged mug',
    ...over,
  });

  // The shape this replaced printed up to four separately-headed sections, two
  // of them numbered from 1, closed by three different questions. Everything the
  // merchant has to do is one list now, so the numbering is the contract.
  it('never numbers the list, and never explains how to reply', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      needsYou: [
        item({ line: 'Sarah — $12 refund · Damaged mug' }),
        item({ line: 'Aisha — reply · Where is order 1051' }),
        item({ kind: 'decision', line: 'Dana asked to move order #1043.' }),
        item({ kind: 'flagged', line: 'Marcus Reed asked when their order ships.' }),
      ],
    });
    // Nobody texts a colleague "reply 1 with yes". The numbers only ever existed
    // because the ordinal resolver wanted them, and replies resolve by name.
    expect(msg).not.toMatch(/^\s*\d+\. /m);
    expect(msg).not.toMatch(/Reply with|reply with a number|"1 yes"/);
    expect(msg).toContain('Two are ready to go the moment you say.');
    expect(msg).toContain('One I need you on.');
    expect(msg).toContain("One I'm not sure about.");
  });

  // The group lead already carries the count, so a headline above it counts the
  // same work twice before the merchant has read any of it.
  it('greets without restating the count the groups already give', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      opener: 'Morning, Ada here.',
      needsYou: [item(), item()],
    });
    expect(msg.split('\n')[0]).toBe('Morning, Ada here.');
    expect(msg).toContain('Two are ready to go the moment you say.');
    expect(msg).not.toContain('things need you');
  });

  it('closes like a person, not with an instruction', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      needsYou: [item(), item({ kind: 'decision', line: 'Dana asked something.' })],
    });
    expect(msg).toContain('Let me know how you want to play these.');
    expect(msg).not.toMatch(/Reply with|number/);
  });

  it('uses one lead when everything is the same kind', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      needsYou: [item(), item()],
    });
    expect(msg).toContain('Two are ready to go the moment you say.');
    expect(msg).not.toContain('I need you on');
    expect(msg.trimEnd().endsWith('Want me to send them?')).toBe(true);
  });

  it('folds everything needing nothing into one closing paragraph', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'filtered' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets, null, {
      needsYou: [item()],
      handledSection: 'Since your last briefing I replied to Bob.',
      quietSentence: 'Two others are ticking along without me.',
    });
    // One sentence per line, so the tail is the last three lines rather than one.
    expect(msg.trim().split('\n').slice(-3)).toEqual([
      'Since your last briefing I replied to Bob.',
      'I filed one as spam.',
      'Two others are ticking along without me.',
    ]);
  });

  it('signs off rather than trailing away when nothing needs them', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      handledSection: 'Since your last briefing I replied to Bob.',
    });
    expect(msg).toContain("I'll shout if anything comes in.");
    expect(msg).not.toContain('need you');
  });

  it('shows the weekly line only when there is nothing to act on', () => {
    const stats = 'Last 7 days: five tickets in.';
    expect(formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), stats, {}))
      .toContain('Last 7 days');
    expect(formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), stats, { needsYou: [item()] }))
      .not.toContain('Last 7 days');
  });

  it('mentions spam filing only when something was filed', () => {
    const filed = bucketDigestThreads([makeThread({ filterStatus: 'filtered' })], NOW, FILED_SINCE);
    expect(formatDigestMessage(filed, null, { needsYou: [item()] })).toContain('I filed one as spam.');
    expect(formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, { needsYou: [item()] }))
      .not.toContain('spam');
  });

  it('inserts Shopify garnish lines without breaking the list', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      needsYou: [item()],
      garnishLines: ['Two orders came in overnight.'],
    });
    expect(msg).toContain('Two orders came in overnight.');
    expect(msg.indexOf('1. Sarah')).toBeLessThan(msg.indexOf('Two orders came in overnight.'));
  });

  // Standing invariants, carried over from the shape this replaced.
  it('writes no em-dashes of its own and teaches no command syntax', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      opener: 'Morning, Ada here.',
      needsYou: [item({ line: 'Sarah wants a refund.' }), item({ kind: 'flagged', line: 'Marcus Reed wrote in.' })],
      handledSection: 'Since your last briefing I replied to Bob.',
    });
    expect(msg).not.toMatch(/<n>|<text>|OPEN|SPAM|REPLY|Shortcuts|"open 1"|"spam 1"/);
  });

  it('never proposes binning a flagged ticket', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      needsYou: [item({ kind: 'flagged', line: 'Marcus Reed wrote in.' })],
    });
    expect(msg).not.toMatch(/bin it|spam\?|delete/i);
  });
});

describe('buildOrgDigest — inbox scope', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

  afterEach(async () => {
    await cleanupTestData(org?.id);
    org = null;
  });

  it('counts only canonical inbox threads as open tickets', async () => {
    org = await createTestOrg();
    // One open thread per (customer, channel) — the threads table has a partial
    // unique index on open rows, so each thread here needs its own customer.
    const jane = await createTestCustomer(org.id, 'jane@example.com', { name: 'Jane' });
    const operator = await createTestCustomer(org.id, 'op@example.com', { name: 'Operator' });
    const archivedCustomer = await createTestCustomer(org.id, 'old@example.com', { name: 'Old' });
    const janeThread = await createTestThread(org.id, jane.id, 'email');
    await createTestMessage(janeThread.id, 'Is the mug set back in stock?');
    await createTestThread(org.id, operator.id, 'sms_agent');
    await createTestThread(org.id, operator.id, 'dashboard_agent');
    const archived = await createTestThread(org.id, archivedCustomer.id, 'email');
    await db.thread.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    const digest = await buildOrgDigest(org.id, NOW);
    expect(digest?.message).toContain('One I need you on.');
    expect(digest?.message).toContain('Jane');
    expect(digest?.message).not.toContain('Operator');
    expect(digest?.message).not.toContain('Old');
  });

  it('counts filtered threads for the filtered line only inside the briefing window', async () => {
    org = await createTestOrg();
    const genuine = await createTestCustomer(org.id, 'real@example.com', { name: 'Real' });
    const spammer = await createTestCustomer(org.id, 'spam@example.com', { name: 'Spammer' });
    const oldSpammer = await createTestCustomer(org.id, 'old-spam@example.com', { name: 'Old Spammer' });
    const genuineThread = await createTestThread(org.id, genuine.id, 'email');
    await createTestMessage(genuineThread.id, 'Where is my order?');
    const filtered = await createTestThread(org.id, spammer.id, 'email');
    const oldFiltered = await createTestThread(org.id, oldSpammer.id, 'email');
    await db.thread.update({
      where: { id: filtered.id },
      data: {
        filterStatus: ThreadFilterStatus.filtered,
        filterDecidedAt: new Date(NOW.getTime() - 2 * HOUR),
      },
    });
    // Filed days ago and still open, because nothing closes a filtered thread.
    // Re-reporting it would claim the same work every morning.
    await db.thread.update({
      where: { id: oldFiltered.id },
      data: {
        filterStatus: ThreadFilterStatus.filtered,
        filterDecidedAt: new Date(NOW.getTime() - 72 * HOUR),
      },
    });

    const digest = await buildOrgDigest(org.id, NOW);
    expect(digest?.message).toContain('One I need you on.');
    expect(digest?.message).toContain('I filed one as spam.');
  });

  // The four open threads from the diagnosed briefing, which the digest could
  // only describe as one undifferentiated bucket.
  it('carries a lifecycle state per open thread', async () => {
    org = await createTestOrg();
    // One open thread per (customer, channel), per the partial unique index.
    const [empty, answered, blocked, planned] = await Promise.all([
      createTestCustomer(org.id, 'empty@example.com', { name: 'Empty' }),
      createTestCustomer(org.id, 'answered@example.com', { name: 'Answered' }),
      createTestCustomer(org.id, 'blocked@example.com', { name: 'Blocked' }),
      createTestCustomer(org.id, 'planned@example.com', { name: 'Planned' }),
    ]);

    // Only note rows, exactly like the Shopify order webhook's threads.
    const emptyThread = await createTestThread(org.id, empty.id, 'shopify');
    await createTestMessage(emptyThread.id, 'New order #1026 was placed.', 'note');

    const answeredThread = await createTestThread(org.id, answered.id, 'email');
    await sentAtMinutesAgo(
      (await createTestMessage(answeredThread.id, 'Do you ship to Ireland?')).id,
      20,
    );
    await sentAtMinutesAgo(
      (await createTestMessage(answeredThread.id, 'We do, three to five days.', 'agent')).id,
      10,
    );

    const blockedThread = await createTestThread(org.id, blocked.id, 'email');
    await createTestMessage(blockedThread.id, 'Where is my order?');

    const plannedThread = await createTestThread(org.id, planned.id, 'email');
    const plannedMessage = await createTestMessage(plannedThread.id, 'Can I get a refund?');
    await db.thread.update({
      where: { id: plannedThread.id },
      data: {
        cachedPlan: replyPlanCache('Refund request', plannedMessage.id),
        cachedPlanMessageId: plannedMessage.id,
      },
    });

    const digest = await buildOrgDigest(org.id, NOW);
    const byThread = new Map(digest!.lifecycleStates.map((row) => [row.threadId, row.state]));

    expect(byThread.get(emptyThread.id)).toBe('empty_thread');
    expect(byThread.get(answeredThread.id)).toBe('awaiting_customer');
    expect(byThread.get(blockedThread.id)).toBe('blocked_no_plan');
    // Fresh, so the three-hour stale scan has not parked it — this asserts the
    // cached-plan path, not the operator ledger.
    expect(byThread.get(plannedThread.id)).toBe('awaiting_approval');

    // State names are a vocabulary for the code, never words the merchant reads.
    expect(digest?.message).not.toContain('awaiting');
    expect(digest?.message).not.toContain('blocked');
  });

  // Every thread classified before `no_request` existed parses with it false,
  // which has to mean "assume they did ask for something". The opposite default
  // would empty the briefing on deploy day and hide real customers.
  it('keeps reporting threads classified before the no_request signal existed', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'legacy@example.com', { name: 'Dana Ruiz' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await createTestMessage(thread.id, 'My order arrived with a cracked mug.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        aiTitle: 'Cracked Mug On Arrival',
        classifierSignals: {
          version: 2,
          language: 'en',
          intents: { mutative_request: false, policy_question: false, order_status: false },
        },
      },
    });

    const message = (await buildOrgDigest(org.id, NOW))!.message;
    expect(message).toContain('I need you on');
    expect(message).toContain('Dana');
  });

  // The diagnosed 8:00am briefing, rebuilt: five items under one pronoun, four
  // of them in an "Also open" roll-up that the closing "Want me to go ahead with
  // it?" appeared to cover. Each state now gets a section that says what the
  // merchant is actually looking at, and the two message-less Shopify threads
  // say nothing at all.
  it('reads as a text message, not a list with reply instructions', async () => {
    org = await createTestOrg();
    const [waiting, canary, ayumu, visitor, walle, stuck, fresh] = await Promise.all([
      createTestCustomer(org.id, 'waiting@example.com', { name: 'Sarah Chen' }),
      createTestCustomer(org.id, 'canary@example.com', { name: 'Canary Shopkeeper' }),
      createTestCustomer(org.id, 'ayumu@example.com', { name: 'Ayumu Hirano' }),
      createTestCustomer(org.id, 'shopify_chat:sess-1'),
      createTestCustomer(org.id, 'walle@example.com', { name: 'Walle Walson' }),
      createTestCustomer(org.id, 'stuck@example.com', { name: 'Priya Nadar' }),
      createTestCustomer(org.id, 'fresh@example.com', { name: 'Ravi Patel' }),
    ]);

    // The one real approval: a plan cached long enough for the stale scan.
    const waitingThread = await createTestThread(org.id, waiting.id, 'email');
    const waitingMessage = await createTestMessage(waitingThread.id, 'Can you resend my receipt?');
    await db.thread.update({
      where: { id: waitingThread.id },
      data: {
        aiTitle: 'Receipt Resend',
        cachedPlan: replyPlanCache('Resend the receipt', waitingMessage.id),
        cachedPlanMessageId: waitingMessage.id,
        updatedAt: new Date(NOW.getTime() - 4 * HOUR),
      },
    });

    // Both Order Status threads: two webhook note rows each, no conversation.
    const canaryThread = await createTestThread(org.id, canary.id, 'shopify');
    await createTestMessage(canaryThread.id, 'New order #1026 was placed.', 'note');
    await createTestMessage(canaryThread.id, 'Order #1026 has been updated.', 'note');
    await db.thread.update({
      where: { id: canaryThread.id },
      data: { aiTitle: "Where's My Order?", tag: 'Order Status' },
    });
    const ayumuThread = await createTestThread(org.id, ayumu.id, 'shopify');
    await createTestMessage(ayumuThread.id, 'New order #1027 was placed.', 'note');
    await db.thread.update({
      where: { id: ayumuThread.id },
      data: { aiTitle: 'Order Status', tag: 'Order Status' },
    });

    // A one-word hello the agent answered by asking what they were after. The
    // visitor never came back, and a thousand of these a week is what storefront
    // chat looks like — none of it is the merchant's to answer.
    const visitorThread = await createTestThread(org.id, visitor.id, 'shopify_chat');
    await sentAtMinutesAgo((await createTestMessage(visitorThread.id, 'hello')).id, 20);
    await sentAtMinutesAgo(
      (await createTestMessage(visitorThread.id, 'Hi! What can I help you find?', 'agent')).id,
      10,
    );
    await db.thread.update({
      where: { id: visitorThread.id },
      data: { aiTitle: 'Unclear One Word Message', classifierSignals: NO_REQUEST_SIGNALS },
    });

    // Pending customer message, no plan, and nothing that will make one — but
    // the message is "Test", so there is nothing for a merchant to answer either.
    const walleThread = await createTestThread(org.id, walle.id, 'email');
    await createTestMessage(walleThread.id, 'Test');
    await db.thread.update({
      where: { id: walleThread.id },
      data: { aiTitle: 'Unclear One Word Message', classifierSignals: NO_REQUEST_SIGNALS },
    });

    // The handoff that is real: a substantive question, no plan for it.
    const stuckThread = await createTestThread(org.id, stuck.id, 'email');
    await createTestMessage(stuckThread.id, 'Do the linen napkins come in a darker olive?');
    await db.thread.update({
      where: { id: stuckThread.id },
      data: { aiTitle: 'Olive Linen Napkins' },
    });

    // Not in the Palette state: a plan too fresh for the stale scan, which is
    // what is left in "Also open" once the other states are pulled out of it.
    const freshThread = await createTestThread(org.id, fresh.id, 'email');
    const freshMessage = await createTestMessage(freshThread.id, 'Do you ship to Ireland?');
    await db.thread.update({
      where: { id: freshThread.id },
      data: {
        aiTitle: 'Shipping To Ireland',
        cachedPlan: replyPlanCache('Answer the shipping question', freshMessage.id),
        cachedPlanMessageId: freshMessage.id,
      },
    });

    const message = (await buildOrgDigest(org.id, NOW))!.message;

    // Two things need the merchant, numbered once, under one ask. The shape this
    // replaced printed the same two under separate headings with separate
    // numbering and separate closing questions.
    expect(sectionFor(message, 'Sarah')).toContain('ready to go the moment you say');
    expect(sectionFor(message, 'Priya')).toContain('I need you on');
    expect(message).not.toMatch(/^\s*\d+\. /m);

    // The handoff carries the customer's words, not the classifier's paraphrase,
    // because the merchant has to answer the question to take the ticket.
    expect(message).toContain('Priya asked: "Do the linen napkins come in a darker olive?"');
    expect(message).not.toContain('Olive Linen Napkins');

    // Message-less threads, and anything the customer has not actually asked
    // for yet, appear nowhere.
    for (const absent of ['Canary', 'Ayumu', 'Walle', 'Storefront visitor']) {
      expect(message).not.toContain(absent);
    }

    // Ravi's plan is too fresh to be parked, so he is not work yet — he is one
    // sentence at the end rather than a heading of his own.
    expect(message).not.toContain('Ravi');
    expect(message).toContain('ticking along without me');

    // One ask, and it is the last thing before the tail. The old shape closed
    // with three, in three different places.
    expect(message).toContain('Let me know how you want to play these.');
    expect(message).not.toMatch(/Reply with|"1 yes"/);
    // The tail is news, so it lands after the close rather than between the
    // rundown and the question about it.
    expect(message.trimEnd().endsWith('ticking along without me.')).toBe(true);
  });
});

describe('formatWeeklySummaryLine', () => {
  function makeStats(overrides: Partial<SupportStatsSummary> = {}): SupportStatsSummary {
    return {
      from: '2026-04-22T12:00:00.000Z',
      to: '2026-04-29T12:00:00.000Z',
      tickets: { total: 38, byTag: [{ tag: 'Shipping', count: 12 }], byChannel: [], byDay: [] },
      messages: { customer: 50, agent: 10, ai: 25 },
      resolution: { closedCount: 29, avgMinutes: 42 },
      ...overrides,
    };
  }

  it('renders ticket count, top topic, and resolution', () => {
    expect(formatWeeklySummaryLine(makeStats(), 5)).toBe(
      'Last 7 days: 38 tickets in, mostly Shipping, 29 resolved in 42m on average.',
    );
  });

  it('rounds long resolution times to hours', () => {
    const line = formatWeeklySummaryLine(makeStats({ resolution: { closedCount: 4, avgMinutes: 200 } }), 5);
    expect(line).toContain('four resolved in 3h on average');
  });

  it('spells small ticket counts, so the same noun is not rendered two ways', () => {
    // "You've got five open tickets" and "5 tickets in" four lines apart is what
    // reads as inconsistent. Durations and the window length stay in digits.
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 5, byTag: [{ tag: 'Order Status', count: 4 }], byChannel: [], byDay: [] },
      resolution: { closedCount: 0, avgMinutes: null },
    }), 2)).toBe('Last 7 days: five tickets in, mostly Order Status.');
  });

  it('drops the topic part for a one-off tag and for the General catch-all', () => {
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 9, byTag: [{ tag: 'Shipping', count: 1 }], byChannel: [], byDay: [] },
    }), 5)).not.toContain('mostly');

    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 9, byTag: [{ tag: 'General', count: 7 }], byChannel: [], byDay: [] },
    }), 5)).not.toContain('mostly');
  });

  it('stays silent below three tickets a week', () => {
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 1, byTag: [], byChannel: [], byDay: [] },
      resolution: { closedCount: 0, avgMinutes: null },
    }), 0)).toBeNull();
  });

  it('stays silent when the week is the same tickets the open count just named', () => {
    // Five in, none resolved, five still open: "five tickets in" is the same
    // five the line above called open, and reads as a number to reconcile.
    const stalled = makeStats({
      tickets: { total: 5, byTag: [{ tag: 'Order Status', count: 4 }], byChannel: [], byDay: [] },
      resolution: { closedCount: 0, avgMinutes: null },
    });
    expect(formatWeeklySummaryLine(stalled, 5)).toBeNull();

    // A resolution story is new information even at the same volume.
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 5, byTag: [{ tag: 'Order Status', count: 4 }], byChannel: [], byDay: [] },
      resolution: { closedCount: 3, avgMinutes: 30 },
    }), 5)).toContain('three resolved');

    // So is volume the open count does not account for.
    expect(formatWeeklySummaryLine(stalled, 2)).toContain('five tickets in');
  });
});

describe('digestWindowKey', () => {
  // The claim key has to name the merchant's local hour, not the server's: two
  // callers in different regions must agree on which window they are in.
  it('is the merchant local date and hour', () => {
    const settings = { digestTimezone: 'America/Los_Angeles' };
    expect(digestWindowKey(settings, new Date('2026-08-11T15:00:00.008Z'))).toBe('2026-08-11T08');
    // Seven seconds later is the same window — the duplicate this guards.
    expect(digestWindowKey(settings, new Date('2026-08-11T15:00:07.154Z'))).toBe('2026-08-11T08');
    // The next day's send is not.
    expect(digestWindowKey(settings, new Date('2026-08-12T15:00:00.000Z'))).toBe('2026-08-12T08');
  });

  it('does not render local midnight as hour 24', () => {
    expect(digestWindowKey({ digestTimezone: 'UTC' }, new Date('2026-08-11T00:30:00.000Z')))
      .toBe('2026-08-11T00');
  });

  it('falls back to UTC on an unusable timezone', () => {
    expect(digestWindowKey({ digestTimezone: 'Not/AZone' }, new Date('2026-08-11T15:00:00.000Z')))
      .toBe('2026-08-11T15');
  });
});
