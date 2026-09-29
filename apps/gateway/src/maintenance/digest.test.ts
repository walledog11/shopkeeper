import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { db, ThreadFilterStatus } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestMessage, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import { testRefundAndReplyPlanCache } from '../test-fixtures/agent-plan-cache-fixtures.js';
import {
  DIGEST_FIXTURE_HOUR_MS,
  DIGEST_FIXTURE_NOW,
  digestFactsClassifierSignals,
  digestFiledSince,
  makeDigestThreadRow,
} from '../test-fixtures/digest-thread-fixtures.js';
import { seedSarahReplyPendingPlan } from '../test-fixtures/operator-pending-plan-fixtures.js';
import { bucketDigestThreads, buildOrgDigest, digestWindowKey } from './digest.js';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@shopkeeper/agent/ai', () => ({ anthropic: { messages: { create } } }));

beforeEach(() => {
  create.mockReset();
  create.mockRejectedValue(new Error('provider unavailable'));
});

const NOW = DIGEST_FIXTURE_NOW;
const HOUR = DIGEST_FIXTURE_HOUR_MS;
const FILED_SINCE = digestFiledSince(NOW);

describe('bucketDigestThreads', () => {
  it('splits threads into genuine / questionable / filtered buckets', () => {
    const threads = [
      makeDigestThreadRow(NOW, { filterStatus: 'genuine' }),
      makeDigestThreadRow(NOW, { filterStatus: 'genuine' }),
      makeDigestThreadRow(NOW, { filterStatus: 'questionable' }),
      makeDigestThreadRow(NOW, { filterStatus: 'filtered' }),
      makeDigestThreadRow(NOW, { filterStatus: 'filtered' }),
    ];
    const b = bucketDigestThreads(threads, NOW, FILED_SINCE);
    expect(b.genuine).toHaveLength(2);
    expect(b.questionable).toHaveLength(1);
    expect(b.filteredCount).toBe(2);
  });

  it('counts only spam filed since the last briefing, not every filtered thread still open', () => {
    // Nothing closes a filtered thread, so without the window the same spam is
    // re-reported every morning and the number ratchets up all week.
    const threads = [
      makeDigestThreadRow(NOW, { filterStatus: 'filtered', ageHours: 2 }),
      makeDigestThreadRow(NOW, { filterStatus: 'filtered', ageHours: 40 }),
      makeDigestThreadRow(NOW, { filterStatus: 'filtered', ageHours: 70 }),
      // Filtered before the classifier recorded a decision: not evidence of
      // recent work, so not claimed as any.
      makeDigestThreadRow(NOW, { filterStatus: 'filtered', ageHours: 2, filterDecidedAt: null }),
    ];
    expect(bucketDigestThreads(threads, NOW, FILED_SINCE).filteredCount).toBe(1);
  });
});

describe('buildOrgDigest — inbox scope', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

  afterEach(async () => {
    await cleanupTestData(org?.id);
    org = null;
  });

  it('surfaces an explicit escalation once as merchant work', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'maya@example.com', { name: 'Maya' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await createTestMessage(thread.id, 'I need to speak to a person.');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        escalatedAt: NOW,
        classifierSignals: digestFactsClassifierSignals({ ask: 'order_status', subject: 'the delayed order' }),
      },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect(digest.message).toContain('Maya');
    expect(digest.message).toContain('I need to speak to a person.');
    expect(digest.pendingDigest.items.filter((item) => item.threadId === thread.id)).toHaveLength(1);
    expect(digest.pendingDigest.items.find((item) => item.threadId === thread.id)?.kind).toBe('decision');
  });

  // Regression: the 2026-08-23 production briefing asked the merchant what to
  // do immediately after saying the request details were unavailable. The
  // thread was a v4 escalation, so it had no RequestFacts, but its aligned
  // request-source message still contained everything the merchant needed.
  it('renders the request-source message for a pre-v5 escalation instead of asking blind', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'legacy-escalation@example.com', { name: 'Maya' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const requestText = 'Can you move order #1043 to 14 Alder Road before Friday?';
    const sourceMessage = await createTestMessage(thread.id, requestText);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        escalatedAt: NOW,
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 4,
          language: 'en',
          intents: { mutative_request: true },
        },
      },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect.soft(digest.message).toContain(requestText);
    expect.soft(digest.message).not.toContain('Request details unavailable');
    expect.soft(digest.message).not.toMatch(
      /Request details unavailable[\s\S]*What do you want to do\?/,
    );
    expect(digest.pendingDigest.items.find((item) => item.threadId === thread.id)?.kind)
      .toBe('decision');
    expect(digest.pendingDigest.items.find((item) => item.threadId === thread.id)?.needsThreadReview)
      .toBeUndefined();
  });

  it('uses aligned source text when classifier data is missing or malformed', async () => {
    org = await createTestOrg();
    const cases = [
      {
        email: 'missing-classifier@example.com',
        name: 'Ari',
        text: 'Can you confirm whether order #3100 ships today?',
        classifierSignals: null,
      },
      {
        email: 'malformed-classifier@example.com',
        name: 'Bea',
        text: 'Please change order #3101 to the blue version.',
        classifierSignals: 'not-a-classifier-record',
      },
    ] as const;

    for (const fixture of cases) {
      const customer = await createTestCustomer(org.id, fixture.email, { name: fixture.name });
      const thread = await createTestThread(org.id, customer.id, 'email');
      const source = await createTestMessage(thread.id, fixture.text);
      await db.thread.update({
        where: { id: thread.id },
        data: {
          escalatedAt: NOW,
          requestSourceMessageId: source.id,
          ...(fixture.classifierSignals === null
            ? {}
            : { classifierSignals: fixture.classifierSignals }),
        },
      });
    }

    const digest = (await buildOrgDigest(org.id, NOW))!;
    for (const fixture of cases) expect(digest.message).toContain(fixture.text);
    expect(digest.message).not.toContain('Request details unavailable');
    expect(digest.pendingDigest.items).toHaveLength(2);
    expect(digest.pendingDigest.items.every((item) => (
      item.kind === 'decision' && item.needsThreadReview !== true
    ))).toBe(true);
  });

  it('parks a context-free escalation for thread review without asking for a decision', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'review-escalation@example.com', { name: 'Maya' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        escalatedAt: NOW,
        classifierSignals: { version: 4, language: 'en', intents: { mutative_request: true } },
      },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    const pending = digest.pendingDigest.items.find((item) => item.threadId === thread.id);
    expect(pending).toMatchObject({ kind: 'decision', needsThreadReview: true });
    expect(digest.message).toContain("I couldn't retrieve the request details");
    expect(digest.message).toContain('/dashboard/tickets?thread=');
    expect(digest.message).not.toMatch(/Should I go ahead\?|What do you want to do\?|Tell me what you want to do/);
  });

  it('uses source text for a legacy flagged sender instead of requiring blind judgment', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'legacy-flagged@example.com', { name: 'Nia' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const requestText = 'Is order #2088 still arriving tomorrow?';
    const sourceMessage = await createTestMessage(thread.id, requestText);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: ThreadFilterStatus.questionable,
        filterDecidedAt: NOW,
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: { version: 4, language: 'en', intents: { order_status: true } },
      },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    const pending = digest.pendingDigest.items.find((item) => item.threadId === thread.id);
    expect(digest.message).toContain(requestText);
    expect(pending).toMatchObject({ kind: 'flagged' });
    expect(pending?.needsThreadReview).toBeUndefined();
  });

  it('parks a flagged sender with no recoverable source for thread review', async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'review-flagged@example.com', { name: 'Nia' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: ThreadFilterStatus.questionable,
        filterDecidedAt: NOW,
        classifierSignals: 'malformed',
      },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    const pending = digest.pendingDigest.items.find((item) => item.threadId === thread.id);
    expect(pending).toMatchObject({ kind: 'flagged', needsThreadReview: true });
    expect(digest.message).toContain("I couldn't retrieve the request details");
    expect(digest.message).not.toMatch(/Should I go ahead\?|What do you want to do\?|Tell me what you want to do/);
  });

  it('keeps approval actionable alongside a conversation requiring thread review', async () => {
    org = await createTestOrg();
    const [approvalCustomer, reviewCustomer] = await Promise.all([
      createTestCustomer(org.id, 'mixed-approval@example.com', { name: 'Cleo' }),
      createTestCustomer(org.id, 'mixed-review@example.com', { name: 'Dev' }),
    ]);

    const approvalThread = await createTestThread(org.id, approvalCustomer.id, 'email');
    const approvalMessage = await createTestMessage(approvalThread.id, 'Please refund the chipped bowl.');
    await db.thread.update({
      where: { id: approvalThread.id },
      data: {
        cachedPlan: testRefundAndReplyPlanCache('Refund the chipped bowl', approvalMessage.id),
        cachedPlanMessageId: approvalMessage.id,
        requestSourceMessageId: approvalMessage.id,
        classifierSignals: digestFactsClassifierSignals({ ask: 'refund', subject: 'the chipped bowl' }),
        updatedAt: new Date(NOW.getTime() - 4 * HOUR),
      },
    });

    const reviewThread = await createTestThread(org.id, reviewCustomer.id, 'email');
    await db.thread.update({
      where: { id: reviewThread.id },
      data: { escalatedAt: NOW, classifierSignals: 'malformed' },
    });

    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect(digest.message).toContain('Shall I go ahead with this plan?');
    expect(digest.message).toContain('/dashboard/tickets?thread=');
    expect(digest.message).not.toMatch(/Should I go ahead\?|What do you want to do\?|Tell me what you want to do/);
    expect(digest.pendingDigest.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ threadId: approvalThread.id, kind: 'approval' }),
      expect.objectContaining({ threadId: reviewThread.id, kind: 'decision', needsThreadReview: true }),
    ]));
  });

  // Legacy rows still enter recovery, but a missing plan never becomes inferred
  // merchant work merely because classifier signals are incomplete.
  it('does not turn a legacy thread with no plan into a merchant decision', async () => {
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
    expect(message).toContain('Nothing needs you right now.');
    expect(message).not.toContain('Dana');
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

  it('falls back to UTC on an unusable timezone', () => {
    expect(digestWindowKey({ digestTimezone: 'Not/AZone' }, new Date('2026-08-11T15:00:00.000Z')))
      .toBe('2026-08-11T15');
  });
});

describe('conversation briefing pipeline', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;

  beforeEach(async () => {
    org = await createTestOrg();
  });

  afterEach(async () => {
    await cleanupTestData(org.id);
  });

  it('shows a questionable sender with a pending draft only once, as an approval', async () => {
    const plan = await seedSarahReplyPendingPlan(org.id);
    await db.thread.update({
      where: { id: plan.threadId },
      data: { filterStatus: ThreadFilterStatus.questionable },
    });
    const digest = (await buildOrgDigest(org.id, new Date()))!;
    expect(digest.pendingDigest.items).toEqual([
      { threadId: plan.threadId, planId: plan.planId, kind: 'approval' },
    ]);
    expect(digest.message).toContain('Shall I send it?');
    expect(digest.message).not.toContain('Should I keep it or mark it as spam?');
  });

  it('recovers a legacy escalation from the last customer message when no source pointer exists', async () => {
    const customer = await createTestCustomer(org.id, 'legacy@example.com', { name: 'Rae' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await createTestMessage(thread.id, 'My package arrived broken. Can you help?');
    await db.thread.update({ where: { id: thread.id }, data: { escalatedAt: NOW } });
    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect(digest.message).toContain('My package arrived broken. Can you help?');
    expect(digest.pendingDigest.items[0]?.needsThreadReview).toBeUndefined();
  });

  it('does not revive an old approval after a new customer request supersedes it', async () => {
    const plan = await seedSarahReplyPendingPlan(org.id);
    const next = await createTestMessage(plan.threadId, 'Actually, please cancel my order.');
    await db.thread.update({ where: { id: plan.threadId }, data: { requestSourceMessageId: next.id } });
    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect(digest.pendingDigest.items).toEqual([]);
    expect(digest.message).not.toContain('soy wax');
    expect(create).not.toHaveBeenCalled();
  });

  it('honors the stored spend cap for an on-demand briefing and still shows the draft', async () => {
    await seedSarahReplyPendingPlan(org.id);
    await db.organization.update({ where: { id: org.id }, data: { settings: { dailyLLMSpendCapUsd: 0 } } });
    const digest = (await buildOrgDigest(org.id, NOW))!;
    expect(create).not.toHaveBeenCalled();
    expect(digest.message).toContain('Does the lavender candle contain paraffin?');
    expect(digest.message).toContain('soy wax');
    expect(digest.message).toContain('Shall I send it?');
  });
});
