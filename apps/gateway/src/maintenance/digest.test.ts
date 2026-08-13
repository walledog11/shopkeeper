import { afterEach, describe, it, expect } from 'vitest';
import { db, ThreadFilterStatus } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestMessage, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { bucketDigestThreads, buildOrgDigest, digestWindowKey, formatDigestMessage, formatWeeklySummaryLine } from './digest.js';

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
  it('keeps the briefing in one message when approvals are pending', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets, null, {
      opener: 'Morning, Ada here.',
      handledSection: 'Since your last briefing I replied to Sarah.',
      waitingSection: "One thing's still waiting on your OK:\n- refund",
      waitingAsk: 'Want me to go ahead with it?',
    });
    expect(msg).toContain('Morning, Ada here.');
    expect(msg).toContain('replied to Sarah');
    expect(msg).toContain('still waiting on your OK');
    expect(msg).not.toContain("You've got one open ticket");
    expect(msg.trimEnd().endsWith('Want me to go ahead with it?')).toBe(true);
  });

  it('lists open tickets not already shown in the waiting block', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'genuine', customerName: 'Jane', aiSummary: 'Asking where order 1042 is' }),
        makeThread({ filterStatus: 'genuine', customerName: 'Bob', aiSummary: 'Wants a refund on order 1043' }),
      ],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets, null, {
      waitingSection: 'x',
      otherOpenSection: 'Also open:\n- Bob · #1043: Wants a refund',
    });
    expect(msg).toContain('Also open:');
    expect(msg).toContain('Bob · #1043');
    expect(msg).not.toContain("You've got two open tickets");
  });

  // Caught by reading a staged briefing: the handoff was immediately followed by
  // "You've got one open ticket", which counts the same ticket a second time in
  // a neutral voice, right under the sentence that gave it to the merchant.
  it('does not count tickets a section has already named', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'genuine', customerName: 'Priya' })],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets, null, {
      blockedSection: "One I couldn't work out a next step on, so it's yours:\n- Priya: Linen napkins",
    });
    expect(msg).toContain("so it's yours:");
    expect(msg).not.toContain("You've got one open ticket");
  });

  it('still discloses spam filing when the open count is suppressed', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'genuine', customerName: 'Priya' }),
        makeThread({ filterStatus: 'filtered' }),
      ],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets, null, {
      awaitingCustomerSection: "I answered this one and haven't heard back:\n- Priya: Linen napkins",
    });
    expect(msg).not.toContain("You've got one open ticket");
    expect(msg).toContain('I filed one as spam.');
  });

  it('omits weekly stats while approvals are still pending', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets, 'Last 7 days: 5 tickets in.', {
      waitingSection: 'Two things are still waiting on your OK:\n1. a\n2. b',
      waitingAsk: 'Tell me which ones to go ahead with.',
    });
    expect(msg).not.toContain('Last 7 days');
  });

  it('states the open count as a sentence and surfaces only the over-a-day split', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'genuine', ageHours: 30 }),
        makeThread({ filterStatus: 'genuine', ageHours: 10 }),
        makeThread({ filterStatus: 'genuine', ageHours: 1 }),
      ],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("You've got three open tickets.");
    expect(msg).toContain('One has been sitting over a day');
    expect(msg).not.toMatch(/Open tickets:|4-24h|<4h/);
  });

  it('says the inbox is clear rather than reporting a zero', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE));
    expect(msg).toContain("Nothing's waiting on a reply.");
    expect(msg).not.toContain('Open tickets');
  });

  it('greets with the supplied opener ahead of everything else', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets, null, { opener: 'Morning, Ada here.' });
    expect(msg.startsWith('Morning, Ada here.\n')).toBe(true);
  });

  it('writes no em-dashes of its own', () => {
    // The em-dash is the tell that a machine wrote the sentence. Summaries here
    // are dash-free on purpose: customer-derived `aiSummary` text may contain
    // one and this asserts only the copy the formatter itself authors.
    const msg = formatDigestMessage(
      bucketDigestThreads(
        [
          makeThread({ filterStatus: 'genuine', ageHours: 30 }),
          makeThread({ filterStatus: 'genuine', ageHours: 1 }),
          makeThread({ filterStatus: 'questionable', customerName: 'Alice', aiSummary: 'Wholesale pricing' }),
          makeThread({ filterStatus: 'filtered' }),
        ],
        NOW,
        FILED_SINCE,
      ),
      'Last 7 days: 38 tickets in, 29 resolved.',
      { opener: 'Morning, Ada here.', handledSection: 'Handled two things.', waitingSection: 'One waiting.' },
    );
    expect(msg).not.toContain('—');
  });

  it('lists questionable threads with customer + summary, numbered from 1', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'questionable', customerName: 'Alice', aiSummary: 'Asking about wholesale pricing' }),
        makeThread({ filterStatus: 'questionable', customerName: 'Bob', aiSummary: 'Refund request without order #' }),
      ],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There are two I wasn't sure about:");
    expect(msg).toContain('1. Alice: Asking about wholesale pricing');
    expect(msg).toContain('2. Bob: Refund request without order #');
  });

  it('never teaches command syntax — it closes with a question', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'questionable' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets);
    expect(msg.trimEnd().endsWith('Want me to do anything with it?')).toBe(true);
    expect(msg).not.toMatch(/<n>|<text>|OPEN|SPAM|REPLY|Shortcuts|"open 1"|"spam 1"/);
  });

  it('asks non-directionally about flagged tickets, never "want me to bin it"', () => {
    // Flagged means the agent is unsure. Proposing the destructive option
    // invites a one-word yes that bins a real customer.
    const msg = formatDigestMessage(
      bucketDigestThreads(
        [makeThread({ filterStatus: 'questionable' }), makeThread({ filterStatus: 'questionable' })],
        NOW,
        FILED_SINCE,
      ),
    );
    expect(msg).toContain('Want me to do anything with those?');
    expect(msg).not.toMatch(/bin it|bin them|mark.*spam\?/i);
  });

  it('falls back to filterReason when aiSummary is missing', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'questionable', customerName: 'Carl', aiSummary: null, filterReason: 'No order context, generic body' })],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There's one I wasn't sure about, from Carl.\nNo order context, generic body.");
  });

  it('names a lone flagged ticket instead of listing one item, summary on its own line', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'questionable', customerName: 'Alice', aiSummary: 'Asking about wholesale pricing' })],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There's one I wasn't sure about, from Alice.\nAsking about wholesale pricing.");
    expect(msg).not.toContain('1. Alice');
  });

  it('groups the no-action-needed facts together and keeps the ask with its subject', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'questionable', customerName: 'Alice', aiSummary: 'Wholesale pricing' }),
        makeThread({ filterStatus: 'filtered' }),
        makeThread({ filterStatus: 'filtered' }),
      ],
      NOW,
      FILED_SINCE,
    );
    const blocks = formatDigestMessage(buckets).split('\n\n');
    // Status the merchant need not act on, in one breath.
    expect(blocks[0]).toBe(
      "Nothing's waiting on a reply. I filed two as spam.",
    );
    // The thing that needs them.
    expect(blocks[1]).toBe("There's one I wasn't sure about, from Alice.\nWholesale pricing.");
    // A concluding sentence always gets its own block.
    expect(blocks[2]).toBe('Want me to do anything with it?');
  });

  // Same bot-tell as the handoff line, two sections down: "Marcus Reed: Customer
  // asks when their order will ship" repeats the noun the name already supplied
  // and narrates in the present something that happened hours ago.
  it('reports a flagged ticket as a person, not as a record about one', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({
          filterStatus: 'questionable',
          customerName: 'Marcus Reed',
          aiSummary: 'Customer asks when their ceramic mug set order will ship.',
        }),
        makeThread({
          filterStatus: 'questionable',
          customerName: 'Sarah Whitcombe',
          aiSummary: 'Compliments the ceramics line and floats a newsletter tie-up.',
        }),
      ],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain('1. Marcus Reed asked when their ceramic mug set order will ship.');
    expect(msg).not.toContain('Customer asks');
    // Prose that never opened in reported speech keeps the `Name: blurb` shape
    // rather than having a sentence invented around it.
    expect(msg).toContain('2. Sarah Whitcombe: Compliments the ceramics line');
  });

  it('says "they" rather than the name again when only one is flagged', () => {
    const buckets = bucketDigestThreads(
      [makeThread({
        filterStatus: 'questionable',
        customerName: 'Marcus Reed',
        aiSummary: 'Customer asks when their ceramic mug set order will ship.',
      })],
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There's one I wasn't sure about, from Marcus Reed.");
    expect(msg).toContain('They asked when their ceramic mug set order will ship.');
  });

  it('caps the questionable list at 10 and shows a "more" line', () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      makeThread({ filterStatus: 'questionable', customerName: `User${i}` }),
    );
    const buckets = bucketDigestThreads(many, NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There are 13 I wasn't sure about:");
    expect(msg).toContain('1. User0');
    expect(msg).toContain('10. User9');
    expect(msg).not.toContain('11. User10');
    expect(msg).toContain('…and 3 more');
  });

  it('mentions spam filing only when something was filed', () => {
    const withFiltered = bucketDigestThreads([makeThread({ filterStatus: 'filtered' })], NOW, FILED_SINCE);
    expect(formatDigestMessage(withFiltered)).toContain('I filed one as spam.');

    const without = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    expect(formatDigestMessage(without)).not.toContain('as spam');
  });

  it('just ends when there are open tickets and nothing flagged', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    expect(formatDigestMessage(buckets).trimEnd()).toBe("You've got one open ticket.");
  });

  it('signs off rather than trailing away when everything is clear', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE));
    expect(msg.trimEnd().endsWith("I'll shout if anything comes in.")).toBe(true);
  });

  it('includes handled and waiting sections when provided', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(buckets, null, {
      handledSection: 'Since your last briefing I refunded Sarah $12.',
      waitingSection: "One thing's still waiting on your OK:\n- $12 refund for Sarah",
      waitingAsk: 'Want me to go ahead with it?',
    });
    expect(msg).toContain('Since your last briefing I refunded Sarah $12.');
    expect(msg).toContain("still waiting on your OK");
    expect(msg).not.toContain("You've got one open ticket");
    expect(msg).toContain('Want me to go ahead with it?');
  });

  it('does not narrate what the agent is working on when approvals are queued', () => {
    const buckets = bucketDigestThreads(
      Array.from({ length: 5 }, () => makeThread({ filterStatus: 'genuine', ageHours: 1 })),
      NOW,
      FILED_SINCE,
    );
    const msg = formatDigestMessage(buckets, null, {
      waitingSection: 'Four things are still waiting on your OK:\n1. a\n2. b\n3. c\n4. d',
      waitingAsk: 'Tell me which ones to go ahead with.',
    });
    expect(msg).not.toContain("I'm working on");
    expect(msg).not.toContain("You've got five open tickets");
    expect(msg.trimEnd().endsWith('Tell me which ones to go ahead with.')).toBe(true);
  });

  it('drops the sign-off when something is already waiting on the merchant', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW, FILED_SINCE), null, {
      waitingSection: "One thing's still waiting on your OK:\n- $12 refund for Sarah",
      waitingAsk: 'Want me to go ahead with it?',
    });
    expect(msg).not.toContain("I'll shout if anything comes in.");
  });

  it('includes the weekly summary line when provided and omits it otherwise', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW, FILED_SINCE);
    expect(formatDigestMessage(buckets, 'Last 7 days: 5 tickets in.')).toContain('Last 7 days: 5 tickets in.');
    expect(formatDigestMessage(buckets)).not.toContain('Last 7 days');
  });

  it('inserts Shopify garnish lines before the weekly summary', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine', tag: 'Shipping' })], NOW, FILED_SINCE);
    const msg = formatDigestMessage(
      buckets,
      'Last 7 days: 5 tickets in.',
      {
        garnishLines: [
          '3 orders since your last briefing, $120.',
          'Running low:\n- Hat (Blue) — 1 left',
        ],
      },
    );

    const salesIndex = msg.indexOf('3 orders since your last briefing');
    const lowStockIndex = msg.indexOf('Running low:');
    const weeklyIndex = msg.indexOf('Last 7 days');
    expect(salesIndex).toBeGreaterThan(-1);
    expect(lowStockIndex).toBeGreaterThan(salesIndex);
    expect(weeklyIndex).toBeGreaterThan(lowStockIndex);
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
    await createTestThread(org.id, jane.id, 'email');
    await createTestThread(org.id, operator.id, 'sms_agent');
    await createTestThread(org.id, operator.id, 'dashboard_agent');
    const archived = await createTestThread(org.id, archivedCustomer.id, 'email');
    await db.thread.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    const digest = await buildOrgDigest(org.id, NOW);
    expect(digest?.message).toContain("You've got one open ticket");
  });

  it('counts filtered threads for the filtered line only inside the briefing window', async () => {
    org = await createTestOrg();
    const genuine = await createTestCustomer(org.id, 'real@example.com', { name: 'Real' });
    const spammer = await createTestCustomer(org.id, 'spam@example.com', { name: 'Spammer' });
    const oldSpammer = await createTestCustomer(org.id, 'old-spam@example.com', { name: 'Old Spammer' });
    await createTestThread(org.id, genuine.id, 'email');
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
    expect(digest?.message).toContain("You've got one open ticket");
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
    expect(message).toContain("couldn't work out a next step");
    expect(message).toContain('Dana');
  });

  // The diagnosed 8:00am briefing, rebuilt: five items under one pronoun, four
  // of them in an "Also open" roll-up that the closing "Want me to go ahead with
  // it?" appeared to cover. Each state now gets a section that says what the
  // merchant is actually looking at, and the two message-less Shopify threads
  // say nothing at all.
  it('gives each lifecycle state its own section and scopes the ask to the approval', async () => {
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

    // Three sections, each saying something different about what it lists.
    expect(message).toContain("One thing's still waiting on your OK:");
    expect(message).toContain("One I couldn't work out a next step on, so it's yours:");
    expect(message).toContain('Also open:');

    // Each thread under the heading that describes it, and nowhere else.
    expect(sectionFor(message, 'Sarah')).toContain('waiting on your OK');
    expect(sectionFor(message, 'Priya')).toContain("couldn't work out a next step");
    expect(sectionFor(message, 'Ravi')).toContain('Also open:');

    // The handoff carries the customer's words, not the classifier's paraphrase,
    // because the merchant has to answer the question to take the ticket.
    expect(message).toContain('Priya asked: "Do the linen napkins come in a darker olive?"');
    expect(message).not.toContain('Olive Linen Napkins');

    // The two message-less threads are not in any of them.
    expect(message).not.toContain('Canary');
    expect(message).not.toContain('Ayumu');

    // Neither is anything the customer has not actually asked for yet: a
    // one-word hello is the agent's to follow up, not the merchant's to answer.
    expect(message).not.toContain('Walle');
    expect(message).not.toContain('Storefront visitor');
    expect(message).not.toContain("haven't heard back");

    // The ask names its own list instead of the "it" that covered all five.
    expect(message.trimEnd().endsWith('Want me to go ahead with the one waiting on your OK?')).toBe(true);
    expect(message).not.toContain('Want me to go ahead with it?');
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
