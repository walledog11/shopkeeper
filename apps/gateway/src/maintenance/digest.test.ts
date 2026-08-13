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
  };
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
  // only describe as one undifferentiated bucket. The states are carried here;
  // nothing reads them yet, so the message must be byte-identical.
  it('carries a lifecycle state per open thread without changing the message', async () => {
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
    await createTestMessage(answeredThread.id, 'Do you ship to Ireland?');
    await createTestMessage(answeredThread.id, 'We do, three to five days.', 'agent');

    const blockedThread = await createTestThread(org.id, blocked.id, 'email');
    await createTestMessage(blockedThread.id, 'Where is my order?');

    const plannedThread = await createTestThread(org.id, planned.id, 'email');
    const plannedMessage = await createTestMessage(plannedThread.id, 'Can I get a refund?');
    await db.thread.update({
      where: { id: plannedThread.id },
      data: {
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: 'Refund request',
          plan: {
            instruction: 'Refund request',
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
          lastCustomerMessageId: plannedMessage.id,
          settings: resolveAgentSettings(null),
        }),
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

    expect(digest?.message).toContain("You've got four open tickets");
    expect(digest?.message).not.toContain('awaiting');
    expect(digest?.message).not.toContain('blocked');
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
