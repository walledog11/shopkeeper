import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  DIGEST_CURSOR_KEY,
  formatHandledSection,
  formatWaitingSection,
  loadHandledRollup,
  loadWaitingOnYouItems,
  resolveHandledWindowStart,
} from './digest-briefing.js';
import { updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const NOW = new Date('2026-04-29T12:00:00Z');

// A cached plan that classifies as needing merchant input, so the thread
// qualifies for "Waiting on you" once it goes stale.
function staleReviewPlanCache(lastCustomerMessageId: string) {
  return buildAgentPlanCacheRecord({
    instruction: 'Refund policy question',
    plan: {
      instruction: 'Refund policy question',
      steps: [{
        id: 'step-1',
        tool: 'ask_operator',
        label: 'Ask operator',
        description: 'Ask operator',
        category: 'internal',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'ask_operator', input: { question: 'Can we refund?' } }],
    },
    lastCustomerMessageId,
    settings: resolveAgentSettings(null),
  });
}

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

describe('formatHandledSection', () => {
  it('returns null when nothing was handled', () => {
    expect(formatHandledSection({
      approvedCount: 0,
      autoCount: 0,
      replyCount: 0,
      refundCount: 0,
      notableLines: [],
    })).toBeNull();
  });

  it('folds a single handled item into one sentence instead of a list of one', () => {
    expect(formatHandledSection({
      approvedCount: 1,
      autoCount: 0,
      replyCount: 1,
      refundCount: 0,
      notableLines: ['Replied to Sarah'],
    })).toBe('Since your last briefing I replied to Sarah.');
  });

  it('keeps the autonomy line on a single folded item', () => {
    expect(formatHandledSection({
      approvedCount: 0,
      autoCount: 1,
      replyCount: 1,
      refundCount: 0,
      notableLines: ['Replied to Sarah'],
    })).toBe('Since your last briefing I replied to Sarah.\n\nThat one ran without needing you.');
  });

  it('summarizes committed work and notable lines', () => {
    const section = formatHandledSection({
      approvedCount: 1,
      autoCount: 1,
      replyCount: 2,
      refundCount: 1,
      notableLines: ['Refunded Sarah $12', 'Replied to Bob'],
    });
    expect(section).toContain('Since your last briefing I handled two things');
    expect(section).toContain('one refund');
    expect(section).toContain('two replies');
    expect(section).toContain('Refunded Sarah $12');
    expect(section).toContain('One of those ran without needing you.');
  });

  it('omits the autonomy line when the merchant approved everything', () => {
    const section = formatHandledSection({
      approvedCount: 2,
      autoCount: 0,
      replyCount: 2,
      refundCount: 0,
      notableLines: [],
    });
    expect(section).toBe('Since your last briefing I handled two things, including two replies.');
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
    expect(items[0]?.line).toBe(
      '$12 refund for Sarah: Order arrived damaged, wants money back (waiting 1 day)',
    );
    // The "still waiting on your OK" framing belongs to the header, once.
    expect(formatWaitingSection(items)).toBe(
      "One thing's still waiting on your OK:\n"
      + '- $12 refund for Sarah: Order arrived damaged, wants money back (waiting 1 day)\n'
      + '\n'
      + 'Want me to go ahead with it?',
    );
  });

  it('numbers several waiting items and never invites a bare yes across them', async () => {
    // Two pending plans for the *same* customer: the case the old copy rendered
    // as two identical "Reply to Canary" bullets.
    for (const [index, summary] of [
      ['a', 'Asking where order 1042 is.'],
      ['b', 'Wants to change the shipping address.'],
    ] as const) {
      const customer = await createTestCustomer(org.id, `canary-${index}@example.com`, { name: 'Canary Reid' });
      const thread = await createTestThread(org.id, customer.id, 'email');
      await db.thread.update({
        where: { id: thread.id },
        data: { aiSummary: summary, updatedAt: new Date(NOW.getTime() - 5 * 3_600_000) },
      });
      await updateContext(org.id, `chat-${index}`, {
        pendingPlan: {
          threadId: thread.id,
          instruction: 'Answer the customer',
          planId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index === 'a' ? '1' : '2'}`,
          actionLabel: 'reply to Canary',
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
        },
      });
    }

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(2);
    const section = formatWaitingSection(items)!;
    expect(section).toContain('Two things are still waiting on your OK:');
    expect(section).toContain('1. Reply to Canary: ');
    expect(section).toContain('2. Reply to Canary: ');
    // Every line differs by subject, so the list is worth reading.
    expect(section).toContain('Asking where order 1042 is (waiting 5 hours)');
    expect(section).toContain('Wants to change the shipping address (waiting 5 hours)');
    // A bare "yes" here would approve only the most recent plan.
    expect(section.trimEnd().endsWith('Tell me which ones to go ahead with.')).toBe(true);
    expect(section).not.toMatch(/Want me to send (any of )?those\?/);
  });

  it('includes stale dashboard plans that still need review', async () => {
    const customer = await createTestCustomer(org.id, 'bob@example.com', { name: 'Bob Lee' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Can I get a refund?');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlan: staleReviewPlanCache(message.id),
        cachedPlanMessageId: message.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.line).toContain('Bob');
    expect(formatWaitingSection(items)).toContain("still waiting on your OK");
  });

  it('never names a customer it does not have', async () => {
    const customer = await createTestCustomer(org.id, 'anon@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    await updateContext(org.id, 'chat-anon', {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Answer the customer',
        planId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items[0]?.line).not.toContain('Customer');
    expect(items[0]?.line).toContain('the customer');
  });

  it('ignores stale plans on threads outside the support inbox', async () => {
    const customer = await createTestCustomer(org.id, 'op@example.com', { name: 'Operator' });
    for (const channel of ['sms_agent', 'dashboard_agent'] as const) {
      const thread = await createTestThread(org.id, customer.id, channel);
      const message = await createTestMessage(thread.id, 'What needs my attention?');
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: staleReviewPlanCache(message.id),
          cachedPlanMessageId: message.id,
          updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        },
      });
    }

    expect(await loadWaitingOnYouItems(org.id, NOW)).toEqual([]);
  });
});
