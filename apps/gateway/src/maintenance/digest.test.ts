import { afterEach, describe, it, expect } from 'vitest';
import { db, ThreadFilterStatus } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { bucketDigestThreads, buildOrgDigest, formatDigestMessage, formatWeeklySummaryLine } from './digest.js';

const NOW = new Date('2026-04-29T12:00:00Z');
const HOUR = 3_600_000;

function makeThread(overrides: Partial<{
  id: string;
  filterStatus: 'genuine' | 'questionable' | 'filtered';
  ageHours: number;
  tag: string | null;
  customerName: string | null;
  aiSummary: string | null;
  filterReason: string | null;
}> = {}) {
  const ageHours = overrides.ageHours ?? 1;
  return {
    id: overrides.id ?? `t-${Math.random().toString(16).slice(2)}`,
    updatedAt: new Date(NOW.getTime() - ageHours * HOUR),
    tag: overrides.tag === undefined ? 'Support' : overrides.tag,
    filterStatus: (overrides.filterStatus ?? ThreadFilterStatus.genuine) as 'genuine' | 'questionable' | 'filtered',
    aiSummary: overrides.aiSummary ?? null,
    filterReason: overrides.filterReason ?? null,
    customer: { name: overrides.customerName === undefined ? 'Jane' : overrides.customerName },
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
    const b = bucketDigestThreads(threads, NOW);
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
    const b = bucketDigestThreads(threads, NOW);
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
    const b = bucketDigestThreads(threads, NOW);
    expect(b.topTags).toBe('Refund (2) · Shipping (1)');
  });

  it('returns zero counts when no threads provided', () => {
    const b = bucketDigestThreads([], NOW);
    expect(b.genuine).toEqual([]);
    expect(b.questionable).toEqual([]);
    expect(b.filteredCount).toBe(0);
    expect(b.urgent + b.stale + b.fresh).toBe(0);
    expect(b.topTags).toBe('');
  });
});

describe('formatDigestMessage', () => {
  it('states the open count as a sentence and surfaces only the over-a-day split', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'genuine', ageHours: 30 }),
        makeThread({ filterStatus: 'genuine', ageHours: 10 }),
        makeThread({ filterStatus: 'genuine', ageHours: 1 }),
      ],
      NOW,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("You've got three open tickets.");
    expect(msg).toContain('One of them has been sitting over a day');
    expect(msg).not.toMatch(/Open tickets:|4-24h|<4h/);
  });

  it('says the inbox is clear rather than reporting a zero', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW));
    expect(msg).toContain("Nothing's waiting on a reply.");
    expect(msg).not.toContain('Open tickets');
  });

  it('greets with the supplied opener ahead of everything else', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
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
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There are two I wasn't sure about:");
    expect(msg).toContain('1. Alice: Asking about wholesale pricing');
    expect(msg).toContain('2. Bob: Refund request without order #');
  });

  it('never teaches command syntax — it closes with a question', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'questionable' })], NOW);
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
      ),
    );
    expect(msg).toContain('Want me to do anything with those?');
    expect(msg).not.toMatch(/bin it|bin them|mark.*spam\?/i);
  });

  it('falls back to filterReason when aiSummary is missing', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'questionable', customerName: 'Carl', aiSummary: null, filterReason: 'No order context, generic body' })],
      NOW,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There's one I wasn't sure about, from Carl.\nNo order context, generic body.");
  });

  it('names a lone flagged ticket instead of listing one item, summary on its own line', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'questionable', customerName: 'Alice', aiSummary: 'Asking about wholesale pricing' })],
      NOW,
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
    const buckets = bucketDigestThreads(many, NOW);
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain("There are 13 I wasn't sure about:");
    expect(msg).toContain('1. User0');
    expect(msg).toContain('10. User9');
    expect(msg).not.toContain('11. User10');
    expect(msg).toContain('…and 3 more');
  });

  it('mentions spam filing only when something was filed', () => {
    const withFiltered = bucketDigestThreads([makeThread({ filterStatus: 'filtered' })], NOW);
    expect(formatDigestMessage(withFiltered)).toContain('I filed one as spam.');

    const without = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    expect(formatDigestMessage(without)).not.toContain('as spam');
  });

  it('just ends when there are open tickets and nothing flagged', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    expect(formatDigestMessage(buckets).trimEnd()).toBe("You've got one open ticket.");
  });

  it('signs off rather than trailing away when everything is clear', () => {
    const msg = formatDigestMessage(bucketDigestThreads([], NOW));
    expect(msg.trimEnd().endsWith("I'll shout if anything comes in.")).toBe(true);
  });

  it('includes handled and waiting sections when provided', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    const msg = formatDigestMessage(buckets, null, {
      handledSection: 'Since your last briefing I handled 1 thing:\n- Refunded Sarah $12',
      waitingSection: "One thing's still waiting on your OK:\n- $12 refund for Sarah",
    });
    expect(msg).toContain('Since your last briefing I handled 1 thing');
    expect(msg).toContain('Refunded Sarah $12');
    expect(msg).toContain("still waiting on your OK");
    expect(msg).toContain("You've got one open ticket");
  });

  it('includes the weekly summary line when provided and omits it otherwise', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    expect(formatDigestMessage(buckets, 'Last 7 days: 5 tickets in.')).toContain('Last 7 days: 5 tickets in.');
    expect(formatDigestMessage(buckets)).not.toContain('Last 7 days');
  });

  it('inserts Shopify garnish lines before the weekly summary', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine', tag: 'Shipping' })], NOW);
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

  it('still counts filtered threads for the filtered line', async () => {
    org = await createTestOrg();
    const genuine = await createTestCustomer(org.id, 'real@example.com', { name: 'Real' });
    const spammer = await createTestCustomer(org.id, 'spam@example.com', { name: 'Spammer' });
    await createTestThread(org.id, genuine.id, 'email');
    const filtered = await createTestThread(org.id, spammer.id, 'email');
    await db.thread.update({
      where: { id: filtered.id },
      data: { filterStatus: ThreadFilterStatus.filtered },
    });

    const digest = await buildOrgDigest(org.id, NOW);
    expect(digest?.message).toContain("You've got one open ticket");
    expect(digest?.message).toContain('I filed one as spam.');
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
    expect(formatWeeklySummaryLine(makeStats())).toBe(
      'Last 7 days: 38 tickets in, mostly Shipping, 29 resolved in 42m on average.',
    );
  });

  it('rounds long resolution times to hours', () => {
    const line = formatWeeklySummaryLine(makeStats({ resolution: { closedCount: 4, avgMinutes: 200 } }));
    expect(line).toContain('4 resolved in 3h on average');
  });

  it('drops the topic part for a one-off tag and for the General catch-all', () => {
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 9, byTag: [{ tag: 'Shipping', count: 1 }], byChannel: [], byDay: [] },
    }))).not.toContain('mostly');

    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 9, byTag: [{ tag: 'General', count: 7 }], byChannel: [], byDay: [] },
    }))).not.toContain('mostly');
  });

  it('stays silent below three tickets a week', () => {
    expect(formatWeeklySummaryLine(makeStats({
      tickets: { total: 1, byTag: [], byChannel: [], byDay: [] },
      resolution: { closedCount: 0, avgMinutes: null },
    }))).toBeNull();
  });
});
