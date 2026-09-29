import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import {
  testAskOperatorPlanCache,
  testReplyPlanCache,
} from '../test-fixtures/agent-plan-cache-fixtures.js';
import { DIGEST_FIXTURE_NOW } from '../test-fixtures/digest-thread-fixtures.js';
import {
  DIGEST_CURSOR_KEY,
  formatBlockedTicketLine,
  loadHandledRollup,
  loadWaitingOnYouItems,
  resolveHandledWindowStart,
} from './digest-briefing/index.js';
import { formatConversationParagraph } from './digest-briefing/conversation.js';
import { appendPendingPlan, updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const NOW = DIGEST_FIXTURE_NOW;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('resolveHandledWindowStart', () => {
  it('uses the org digest cursor when present', () => {
    const since = resolveHandledWindowStart({
      [DIGEST_CURSOR_KEY]: '2026-04-28T08:00:00.000Z',
    }, NOW);
    expect(since.toISOString()).toBe('2026-04-28T08:00:00.000Z');
  });

  it('falls back to a 24-hour lookback without a cursor', () => {
    const since = resolveHandledWindowStart({}, NOW);
    expect(since.toISOString()).toBe('2026-04-28T12:00:00.000Z');
  });
});

describe('loadHandledRollup', () => {
  it('rolls up committed plan executions since the cursor', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const execution = await db.planExecution.create({
      data: {
        planId: '11111111-1111-4111-8111-111111111111',
        organizationId: org.id,
        threadId: thread.id,
        planHash: 'plan-hash',
        instructionHash: 'instruction-hash',
        status: 'committed',
        mode: 'human_approved',
        completedAt: new Date('2026-04-29T10:00:00Z'),
        claimToken: '22222222-2222-4222-8222-222222222222',
        claimedAt: new Date('2026-04-29T09:59:00Z'),
      },
    });
    await db.agentAction.create({
      data: {
        turnId: '33333333-3333-4333-8333-333333333333',
        organizationId: org.id,
        threadId: thread.id,
        executionId: execution.id,
        tool: 'create_refund',
        category: 'action',
        input: { amount: 12 },
        status: 'success',
        mode: 'human_approved',
        durationMs: 10,
      },
    });

    const rollup = await loadHandledRollup(org.id, new Date('2026-04-29T08:00:00Z'));
    expect(rollup.approvedCount).toBe(1);
    expect(rollup.refundCount).toBe(1);
    expect(rollup.notableLines[0]).toContain('Sarah');
    expect(rollup.notableLines[0]).toContain('$12');
  });
});

describe('formatBlockedTicketLine', () => {
  it('redacts contact details but keeps an actionable postal address in the quote', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      pendingMessage: 'Reach me at ada@example.com or 14 Alder Road about the mug',
    }));
    expect(section).toContain('their email');
    expect(section).not.toContain('ada@example.com');
    expect(section).toContain('14 Alder Road');
    expect(section).not.toContain('[address redacted]');
  });
});

describe('loadWaitingOnYouItems', () => {
  it('dedupes operator pending plans by stable plan id', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const pendingPlan = {
      threadId: thread.id,
      instruction: 'Refund the late order',
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      planHash: 'hash-a',
      instructionHash: 'hash-b',
      actionLabel: 'issue refund for Sarah',
      requestDisplay: {
        version: 1 as const,
        kind: 'classified' as const,
        sourceMessageId: 'message-refund',
        facts: {
          ask: 'refund' as const,
          subject: 'damaged order',
          order: null,
          deadline: null,
          deadlineText: null,
          alternative: null,
        },
        noRequest: false,
        topic: null,
      },
      rawToolCalls: [{ id: 'tc1', name: 'create_refund', input: { amount: 12 } }],
    };

    await db.thread.update({
      where: { id: thread.id },
      data: {
        aiSummary: 'Order arrived damaged, wants money back.',
        updatedAt: new Date(NOW.getTime() - 26 * 3_600_000),
      },
    });

    await updateContext(org.id, 'chat-1', { pendingPlan });
    await updateContext(org.id, 'chat-2', { pendingPlan });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    // Action, then what it's about, then how long it has sat: without the last
    // two, four pending replies to one customer render as four identical lines.
    // Person first, then what a yes does, then what it is about. The action used
    // to lead, which put a tool label in the most scannable position of a line
    // the merchant reads seven of.
    expect(items[0]?.conversation.person).toBe('Sarah');
    expect(items[0]?.conversation.requestContext).toContain('refund');
    expect(items[0]?.conversation.actions).toContain('issue a refund of 12');
    expect(items[0]?.needsThreadReview).toBe(false);

  });

  it('keeps a context-free approval parked but marks it for thread review', async () => {
    const customer = await createTestCustomer(org.id, 'review-approval@example.com', { name: 'Inez' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const planId = 'abababab-abab-4bab-8bab-abababababab';
    await updateContext(org.id, 'review-approval', {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Reply to the customer',
        planId,
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'On it.' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ threadId: thread.id, planId, needsThreadReview: true });
    expect(formatConversationParagraph(items[0]!.conversation, 'approval', true))
      .toContain("couldn't retrieve the request details");
  });

  it('recovers source text for a legacy operator approval with aligned identity', async () => {
    const customer = await createTestCustomer(org.id, 'legacy-approval@example.com', { name: 'Inez' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const source = await createTestMessage(thread.id, 'Can you refund the chipped bowl from order #778?');
    const planId = 'acacacac-acac-4cac-8cac-acacacacacac';
    await db.thread.update({
      where: { id: thread.id },
      data: {
        requestSourceMessageId: source.id,
        classifierSignals: { version: 4, language: 'en', intents: { mutative_request: true } },
      },
    });
    await updateContext(org.id, 'legacy-approval', {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Reply to the customer',
        planId,
        sourceMessageId: source.id,
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'I can help.' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ threadId: thread.id, planId, needsThreadReview: false });
    expect(items[0]?.conversation.request).toContain('Can you refund the chipped bowl from order #778?');
  });

  it('includes stale dashboard plans that still need review', async () => {
    const customer = await createTestCustomer(org.id, 'bob@example.com', { name: 'Bob Lee' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Can I get a refund?');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlan: testAskOperatorPlanCache(message.id),
        cachedPlanMessageId: message.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: {},
          requestFacts: { ask: 'refund' },
        },
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.conversation.person).toContain('Bob');
    expect(items[0]?.conversation.question).toBe('Can we refund?');
  });

  it('recovers source text for a stale pre-v5 dashboard approval', async () => {
    const customer = await createTestCustomer(org.id, 'legacy-dashboard@example.com', { name: 'Bob Lee' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Could I get a refund for the cracked vase?');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlan: testAskOperatorPlanCache(message.id),
        cachedPlanMessageId: message.id,
        requestSourceMessageId: message.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        classifierSignals: { version: 4, language: 'en', intents: { mutative_request: true } },
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.needsThreadReview).toBe(false);
    expect(items[0]?.conversation.request).toContain('Could I get a refund for the cracked vase?');
  });

  it('keeps safe replies out of the merchant queue while preserving real reviews', async () => {
    // The queue holds one plan, so parking the second drops the first from the
    // phone's approval slot. The evicted quick reply belongs to automatic
    // recovery now; the refund review remains merchant work.
    const evicted = await createTestCustomer(org.id, 'first@example.com', { name: 'Ada First' });
    const evictedThread = await createTestThread(org.id, evicted.id, 'email');
    const evictedMessage = await createTestMessage(evictedThread.id, 'Do you ship to Ireland?');

    const kept = await createTestCustomer(org.id, 'second@example.com', { name: 'Bo Second' });
    const keptThread = await createTestThread(org.id, kept.id, 'email');
    const keptMessage = await createTestMessage(keptThread.id, 'Can I get a refund?');

    await db.thread.update({
      where: { id: evictedThread.id },
      data: {
        aiSummary: 'Asking whether we ship to Ireland.',
        cachedPlan: testReplyPlanCache('Answer the shipping question', evictedMessage.id),
        cachedPlanMessageId: evictedMessage.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      },
    });
    await db.thread.update({
      where: { id: keptThread.id },
      data: {
        aiSummary: 'Wants a refund on a damaged order.',
        cachedPlan: testAskOperatorPlanCache(keptMessage.id),
        cachedPlanMessageId: keptMessage.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      },
    });

    for (const [threadId, planId, actionLabel] of [
      [evictedThread.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'reply to Ada'],
      [keptThread.id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ask about the refund'],
    ] as const) {
      await appendPendingPlan(
        org.id,
        'member:1',
        {
          threadId,
          instruction: 'Handle the customer',
          planId,
          actionLabel,
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
        },
        1,
      );
    }

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items.map((item) => item.threadId)).toEqual([keptThread.id]);
    expect(items[0]?.conversation.person).not.toContain('Ada');
  });

  it('ignores stale plans on threads outside the support inbox', async () => {
    const customer = await createTestCustomer(org.id, 'op@example.com', { name: 'Operator' });
    for (const channel of ['operator'] as const) {
      const thread = await createTestThread(org.id, customer.id, channel);
      const message = await createTestMessage(thread.id, 'What needs my attention?');
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: testAskOperatorPlanCache(message.id),
          cachedPlanMessageId: message.id,
          updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        },
      });
    }

    expect(await loadWaitingOnYouItems(org.id, NOW)).toEqual([]);
  });
});