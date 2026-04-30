import { describe, it, expect, afterEach } from 'vitest';
import { db, ThreadFilterStatus, ThreadFilterFeedback, ChannelType, SenderType } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';
import {
  bucketDigestThreads,
  formatDigestMessage,
  purgeFilteredThreads,
  FILTERED_PURGE_AFTER_DAYS,
} from './maintenance-workers.js';

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
});

describe('purgeFilteredThreads', () => {
  const PURGE_NOW = new Date('2026-04-29T12:00:00Z');
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const AGED = new Date(PURGE_NOW.getTime() - (FILTERED_PURGE_AFTER_DAYS + 1) * ONE_DAY_MS);
  const RECENT = new Date(PURGE_NOW.getTime() - (FILTERED_PURGE_AFTER_DAYS - 1) * ONE_DAY_MS);

  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  async function setupThread(opts: {
    filterStatus?: 'genuine' | 'questionable' | 'filtered';
    filterFeedback?: 'none' | 'confirmed_genuine' | 'confirmed_spam';
    filterDecidedAt?: Date | null;
  } = {}) {
    if (!orgId) {
      const org = await createTestOrg();
      orgId = org.id;
    }
    const customer = await createTestCustomer(orgId, `c_${Math.random().toString(16).slice(2)}@test.com`);
    const thread = await createTestThread(orgId, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: opts.filterStatus ?? ThreadFilterStatus.filtered,
        filterFeedback: opts.filterFeedback ?? ThreadFilterFeedback.none,
        filterDecidedAt: opts.filterDecidedAt === undefined ? AGED : opts.filterDecidedAt,
      },
    });
    return thread;
  }

  it('hard-deletes aged filtered threads with no feedback and no agent reply', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'spam body', SenderType.customer);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(1);

    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).toBeNull();
    const msgs = await db.message.findMany({ where: { threadId: thread.id } });
    expect(msgs).toHaveLength(0);
  });

  it('preserves filtered threads recovered to genuine via feedback', async () => {
    const thread = await setupThread({ filterFeedback: 'confirmed_genuine' });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads with confirmed_spam feedback', async () => {
    const thread = await setupThread({ filterFeedback: 'confirmed_spam' });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads where the merchant has replied (agent message exists)', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'inbound', SenderType.customer);
    await createTestMessage(thread.id, 'merchant reply', SenderType.agent);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('deletes when only customer + note messages exist (notes do not block purge)', async () => {
    const thread = await setupThread();
    await createTestMessage(thread.id, 'inbound', SenderType.customer);
    await createTestMessage(thread.id, '__clerk_agent__ classified as spam', SenderType.note);

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(1);
  });

  it('preserves filtered threads still inside the 7-day retention window', async () => {
    const thread = await setupThread({ filterDecidedAt: RECENT });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('preserves filtered threads with null filterDecidedAt', async () => {
    const thread = await setupThread({ filterDecidedAt: null });
    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);
    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after).not.toBeNull();
  });

  it('does not touch genuine or questionable threads regardless of age', async () => {
    const genuine = await setupThread({ filterStatus: 'genuine' });
    const questionable = await setupThread({ filterStatus: 'questionable' });

    const count = await purgeFilteredThreads(PURGE_NOW);
    expect(count).toBe(0);

    expect(await db.thread.findUnique({ where: { id: genuine.id } })).not.toBeNull();
    expect(await db.thread.findUnique({ where: { id: questionable.id } })).not.toBeNull();
  });
});
