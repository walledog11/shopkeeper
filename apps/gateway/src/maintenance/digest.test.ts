import { describe, it, expect } from 'vitest';
import { ThreadFilterStatus } from '@shopkeeper/db';
import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import { bucketDigestThreads, formatDigestMessage, formatWeeklySummaryLine } from './digest.js';

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
  it('renders genuine count with urgency breakdown when present', () => {
    const buckets = bucketDigestThreads(
      [
        makeThread({ filterStatus: 'genuine', ageHours: 30 }),
        makeThread({ filterStatus: 'genuine', ageHours: 10 }),
        makeThread({ filterStatus: 'genuine', ageHours: 1 }),
      ],
      NOW,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain('Open tickets: 3');
    expect(msg).toContain('No reply >24h: 1');
    expect(msg).toContain('Needs attention (4-24h): 1');
    expect(msg).toContain('Recent (<4h): 1');
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
    expect(msg).toContain('Flagged (review needed): 2');
    expect(msg).toContain('1. Alice — Asking about wholesale pricing');
    expect(msg).toContain('2. Bob — Refund request without order #');
    // Help footer shows command list
    expect(msg).toContain('OPEN <n>');
    expect(msg).toContain('SPAM <n>');
    expect(msg).toContain('REPLY <n> <text>');
  });

  it('falls back to filterReason when aiSummary is missing', () => {
    const buckets = bucketDigestThreads(
      [makeThread({ filterStatus: 'questionable', customerName: 'Carl', aiSummary: null, filterReason: 'No order context, generic body' })],
      NOW,
    );
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain('1. Carl — No order context, generic body');
  });

  it('caps the questionable list at 10 and shows a "more" line', () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      makeThread({ filterStatus: 'questionable', customerName: `User${i}` }),
    );
    const buckets = bucketDigestThreads(many, NOW);
    const msg = formatDigestMessage(buckets);
    expect(msg).toContain('Flagged (review needed): 13');
    expect(msg).toContain('1. User0');
    expect(msg).toContain('10. User9');
    expect(msg).not.toContain('11. User10');
    expect(msg).toContain('…and 3 more');
  });

  it('shows the filtered count line only when > 0', () => {
    const withFiltered = bucketDigestThreads([makeThread({ filterStatus: 'filtered' })], NOW);
    expect(formatDigestMessage(withFiltered)).toContain('Filtered: 1');

    const without = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    expect(formatDigestMessage(without)).not.toContain('Filtered:');
  });

  it('omits the command help line when there are no questionable threads', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    const msg = formatDigestMessage(buckets);
    expect(msg).not.toContain('OPEN <n>');
    expect(msg).toContain('order number');
  });

  it('includes the weekly summary line when provided and omits it otherwise', () => {
    const buckets = bucketDigestThreads([makeThread({ filterStatus: 'genuine' })], NOW);
    expect(formatDigestMessage(buckets, 'Last 7 days: 5 new tickets')).toContain('Last 7 days: 5 new tickets');
    expect(formatDigestMessage(buckets)).not.toContain('Last 7 days');
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
      'Last 7 days: 38 new tickets · top topic Shipping (12) · 29 resolved, avg 42m',
    );
  });

  it('rounds long resolution times to hours', () => {
    const line = formatWeeklySummaryLine(makeStats({ resolution: { closedCount: 4, avgMinutes: 200 } }));
    expect(line).toContain('4 resolved, avg 3h');
  });

  it('drops the topic and resolution parts when there is no data', () => {
    const line = formatWeeklySummaryLine(makeStats({
      tickets: { total: 1, byTag: [], byChannel: [], byDay: [] },
      resolution: { closedCount: 0, avgMinutes: null },
    }));
    expect(line).toBe('Last 7 days: 1 new ticket');
  });
});
