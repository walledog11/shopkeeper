import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestMessage,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import {
  getContext,
  resolvePendingPlanContexts,
  appendPendingPlan,
  loadLiveOperatorContext,
  mostRecentPendingPlan,
  selectPendingPlan,
  updateContext,
  type PendingPlan,
  type PendingQuestion,
} from './operator-context.js';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { pendingPlanFor } from './test-fixtures/operator-pending-plan-fixtures.js';
import logger from './logger.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('appendPendingPlan (queue)', () => {
  it('stacks plans across threads, newest last', async () => {
    await appendPendingPlan(org.id, 'q1', pendingPlanFor('thread-a', 'plan-a'), 3);
    await appendPendingPlan(org.id, 'q1', pendingPlanFor('thread-b', 'plan-b'), 3);
    await appendPendingPlan(org.id, 'q1', pendingPlanFor('thread-c', 'plan-c'), 3);

    const ctx = await getContext(org.id, 'q1');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-a', 'plan-b', 'plan-c']);
    expect(ctx.pendingPlan?.planId).toBe('plan-c');
    expect(mostRecentPendingPlan(ctx.pendingPlans)?.planId).toBe('plan-c');
  });

  it('trims the oldest once the depth cap is exceeded', async () => {
    await appendPendingPlan(org.id, 'q2', pendingPlanFor('thread-a', 'plan-a'), 2);
    await appendPendingPlan(org.id, 'q2', pendingPlanFor('thread-b', 'plan-b'), 2);
    await appendPendingPlan(org.id, 'q2', pendingPlanFor('thread-c', 'plan-c'), 2);

    const ctx = await getContext(org.id, 'q2');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b', 'plan-c']);
  });

  it('upserts by threadId — a new plan for the same thread replaces the old one', async () => {
    await appendPendingPlan(org.id, 'q3', pendingPlanFor('thread-a', 'plan-a1'), 3);
    await appendPendingPlan(org.id, 'q3', pendingPlanFor('thread-b', 'plan-b'), 3);
    await appendPendingPlan(org.id, 'q3', pendingPlanFor('thread-a', 'plan-a2'), 3);

    const ctx = await getContext(org.id, 'q3');
    // thread-a has one entry (the newer plan), moved to the end; thread-b intact.
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b', 'plan-a2']);
  });

  it('is idempotent under retry — re-appending the same plan yields one entry', async () => {
    const plan = pendingPlanFor('thread-a', 'plan-a');
    await appendPendingPlan(org.id, 'q4', plan, 3);
    await appendPendingPlan(org.id, 'q4', plan, 3);
    await appendPendingPlan(org.id, 'q4', plan, 3);

    const ctx = await getContext(org.id, 'q4');
    expect(ctx.pendingPlans).toHaveLength(1);
    expect(ctx.pendingPlans[0]?.planId).toBe('plan-a');
  });

  it('lands both concurrent appends for different threads (row-lock serialization)', async () => {
    await Promise.all([
      appendPendingPlan(org.id, 'q5', pendingPlanFor('thread-a', 'plan-a'), 5),
      appendPendingPlan(org.id, 'q5', pendingPlanFor('thread-b', 'plan-b'), 5),
    ]);

    const ctx = await getContext(org.id, 'q5');
    expect(ctx.pendingPlans.map((plan) => plan.planId).sort()).toEqual(['plan-a', 'plan-b']);
  });

  it('removes only the acted plan from a multi-plan queue, leaving siblings', async () => {
    await appendPendingPlan(org.id, 'q6', pendingPlanFor('thread-a', 'plan-a'), 3);
    await appendPendingPlan(org.id, 'q6', pendingPlanFor('thread-b', 'plan-b'), 3);

    await resolvePendingPlanContexts(org.id, 'q6', pendingPlanFor('thread-a', 'plan-a'));

    const ctx = await getContext(org.id, 'q6');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b']);
  });
});

describe('selectPendingPlan', () => {
  const a = pendingPlanFor('thread-a', 'plan-a', { customerName: 'Sarah Chen' });
  const b = pendingPlanFor('thread-b', 'plan-b', { customerName: 'Jake Long' });

  it('refuses an old escalation-only card without treating it as approval', () => {
    const escalation = { ...a, rawToolCalls: [{
      id: 'handoff', name: 'escalate_to_human', input: { reason: 'Over the refund limit' },
    }] };
    expect(selectPendingPlan([escalation])).toHaveProperty('code', 'needs_thread_review');
    expect(selectPendingPlan([escalation], 'plan-a')).toHaveProperty('code', 'needs_thread_review');
  });

  it('errors when nothing is pending', () => {
    expect(selectPendingPlan([])).toEqual({ error: expect.stringContaining('no plan'), code: 'none_pending' });
  });

  it('returns the only plan when no ref is supplied and honors an explicit ref', () => {
    expect(selectPendingPlan([a])).toEqual({ plan: a });
    expect(selectPendingPlan([a], 'Sarah')).toEqual({ plan: a });
    expect(selectPendingPlan([a], 'whatever')).toHaveProperty('error');
  });

  it('refuses to approve a plan whose briefing requires thread review', () => {
    const result = selectPendingPlan([a], undefined, {
      items: [{
        threadId: a.threadId,
        kind: 'approval',
        planId: a.planId,
        needsThreadReview: true,
      }],
      sentAt: '2026-08-23T12:00:00.000Z',
    });

    expect(result).toEqual({ error: expect.stringContaining('Open the thread'), code: 'needs_thread_review' });
  });

  it('asks which one when several are pending and no ref is given', () => {
    const result = selectPendingPlan([a, b]);
    expect(result).toEqual({ error: expect.stringContaining('ask which one'), code: 'needs_disambiguation' });
  });

  it('selects by ordinal, planId, and customer name', () => {
    expect(selectPendingPlan([a, b], '2')).toEqual({ plan: b });
    expect(selectPendingPlan([a, b], 'plan-a')).toEqual({ plan: a });
    expect(selectPendingPlan([a, b], 'sarah')).toEqual({ plan: a });
  });

  it('resolves mixed briefing ordinals even when only one plan is pending', () => {
    const digest = { items: [
      { threadId: 'decision-thread', kind: 'decision' as const },
      { threadId: a.threadId, planId: a.planId, kind: 'approval' as const },
    ], threadIds: [], sentAt: new Date().toISOString() };
    expect(selectPendingPlan([a], '1', digest)).toHaveProperty('error');
    expect(selectPendingPlan([a], '2', digest)).toEqual({ plan: a });
    expect(selectPendingPlan([a], 'Sarah', digest)).toEqual({ plan: a });
  });

  it('does not approve a replacement draft via an old briefing ordinal', () => {
    const replacement = { ...a, planId: 'replacement-plan' };
    const digest = { items: [{ threadId: a.threadId, planId: a.planId, kind: 'approval' as const }],
      threadIds: [], sentAt: new Date().toISOString() };
    expect(selectPendingPlan([replacement], '1', digest)).toEqual({ error: expect.stringContaining('no longer pending'), code: 'needs_disambiguation' });
  });

  it('does not approve a merchant question through a name or bare yes', () => {
    const digest = { items: [{ threadId: a.threadId, planId: a.planId, kind: 'decision' as const }],
      threadIds: [], sentAt: new Date().toISOString() };
    expect(selectPendingPlan([a], 'Sarah', digest)).toHaveProperty('error');
    expect(selectPendingPlan([a], undefined, digest)).toHaveProperty('error');
  });

  it('requires a specific reference for customers with the same first name', () => {
    const otherSarah = { ...b, customerName: 'Sarah Jones' };
    expect(selectPendingPlan([a, otherSarah], 'Sarah')).toHaveProperty('error');
    expect(selectPendingPlan([a, otherSarah], 'Sarah Chen')).toEqual({ plan: a });
  });

  it('asks which one on an out-of-range or unmatched ref', () => {
    expect('error' in selectPendingPlan([a, b], '9')).toBe(true);
    expect('error' in selectPendingPlan([a, b], 'nobody')).toBe(true);
  });
});

describe('loadLiveOperatorContext', () => {
  async function currentPendingPlan(params: {
    thread: Awaited<ReturnType<typeof createTestThread>>;
    instruction?: string;
    system?: boolean;
  }): Promise<PendingPlan> {
    const instruction = params.instruction ?? 'reply to the customer';
    const message = await createTestMessage(params.thread.id, 'Please help with this order');
    const plan: AgentPlan = {
      instruction,
      steps: [{
        id: 'send_1',
        tool: 'send_reply',
        label: 'Reply',
        description: 'Reply to customer',
        category: 'communication',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'I can help.' } }],
      validation: { status: 'valid', issues: [] },
    };
    const cache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: message.id,
      settings: resolveAgentSettings(null),
      plan,
    });
    await db.thread.update({
      where: { id: params.thread.id },
      data: { cachedPlan: cache as object, cachedPlanMessageId: message.id },
    });
    return {
      threadId: params.thread.id,
      instruction,
      rawToolCalls: plan.rawToolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input,
      })),
      planId: cache.planId!,
      sourceMessageId: message.id,
      planHash: hashPlan(cache.plan),
      instructionHash: hashInstruction(instruction),
      ...(params.system ? {
        requestDisplay: { version: 1, kind: 'system', event: 'return_arrival' },
      } : {}),
    };
  }

  it('prunes a queued plan whose execution already reached a terminal outcome', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Sarah' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const liveCustomer = await createTestCustomer(org.id, 'live@example.com', { name: 'Live' });
    const liveThread = await createTestThread(org.id, liveCustomer.id, 'email');
    const terminal = await currentPendingPlan({ thread });
    const live = await currentPendingPlan({ thread: liveThread, system: true });
    await db.planExecution.create({
      data: {
        planId: terminal.planId!,
        organizationId: org.id,
        threadId: thread.id,
        planHash: terminal.planHash!,
        instructionHash: terminal.instructionHash!,
        status: 'committed',
        mode: 'human_approved',
        completedAt: new Date(),
        claimToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        claimedAt: new Date(),
      },
    });

    await appendPendingPlan(org.id, 'q7', terminal, 3);
    await appendPendingPlan(org.id, 'q7', live, 3);

    const pruned = await loadLiveOperatorContext(org.id, 'q7', await getContext(org.id, 'q7'));
    expect(pruned.pendingPlans.map((plan) => plan.planId)).toEqual([live.planId]);
    expect(pruned.pendingPlans[0]?.requestDisplay?.kind).toBe('system');
    // The stale entry is also removed from the stored queue.
    expect((await getContext(org.id, 'q7')).pendingPlans.map((plan) => plan.planId)).toEqual([live.planId]);
  });

  // The 2026-09-10 shape: a card goes to the phone, the thread re-plans six
  // seconds later, and the parked entry is discarded while the merchant is still
  // reading it. The drop was silent, so reconstructing it needed a production
  // forensic pass against expired logs.
  it('names the reason when a re-plan supersedes a card the merchant was sent', async () => {
    const customer = await createTestCustomer(org.id, 'replan@example.com', { name: 'Sarah' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const parked = await currentPendingPlan({ thread });
    await appendPendingPlan(org.id, 'q-replan', parked, 3);

    // Re-plan the thread: same customer message, a new plan id.
    await currentPendingPlan({ thread, instruction: 'refund the customer' });
    const infoSpy = vi.spyOn(logger, 'info');

    const pruned = await loadLiveOperatorContext(org.id, 'q-replan', await getContext(org.id, 'q-replan'));

    expect(pruned.pendingPlans).toEqual([]);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: thread.id, planId: parked.planId, reason: 'plan_replaced' }),
      expect.stringContaining('dropped'),
    );
    infoSpy.mockRestore();
  });

  async function currentPendingQuestion(
    thread: Awaited<ReturnType<typeof createTestThread>>,
  ): Promise<PendingQuestion> {
    const asking = await currentPendingPlan({ thread, instruction: 'ask the merchant' });
    return {
      threadId: thread.id,
      question: 'What is the return window on sale items?',
      planId: asking.planId!,
      sourceMessageId: asking.sourceMessageId!,
    };
  }

  it('keeps a question whose asking plan is still the thread\'s cached plan', async () => {
    const customer = await createTestCustomer(org.id, 'q-live@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const question = await currentPendingQuestion(thread);
    await updateContext(org.id, 'q-live', { pendingQuestion: question });

    const loaded = await loadLiveOperatorContext(org.id, 'q-live', await getContext(org.id, 'q-live'));
    expect(loaded.pendingQuestion).toEqual(question);
  });

  // The 11-day-stale production shape: the thread moved on, nothing pruned the
  // question, and the ledger the model reads kept saying an answer was wanted —
  // which also makes a bare "yes" about something else ambiguous, because the
  // keyword fast path defers to the model whenever a question is pending.
  it('prunes a question the thread has re-planned past', async () => {
    const customer = await createTestCustomer(org.id, 'q-replanned@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const question = await currentPendingQuestion(thread);
    await updateContext(org.id, 'q-stale', { pendingQuestion: question });
    await currentPendingPlan({ thread, instruction: 'refund the customer' });
    const infoSpy = vi.spyOn(logger, 'info');

    const loaded = await loadLiveOperatorContext(org.id, 'q-stale', await getContext(org.id, 'q-stale'));

    expect(loaded.pendingQuestion).toBeNull();
    expect((await getContext(org.id, 'q-stale')).pendingQuestion).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: thread.id, planId: question.planId, reason: 'plan_replaced' }),
      expect.stringContaining('question'),
    );
    infoSpy.mockRestore();
  });

  it('prunes a question whose thread is closed or gone', async () => {
    const customer = await createTestCustomer(org.id, 'q-closed@example.com');
    const closedThread = await createTestThread(org.id, customer.id, 'email');
    const closed = await currentPendingQuestion(closedThread);
    await db.thread.update({ where: { id: closedThread.id }, data: { status: 'closed' } });
    await updateContext(org.id, 'q-closed', { pendingQuestion: closed });

    expect(
      (await loadLiveOperatorContext(org.id, 'q-closed', await getContext(org.id, 'q-closed'))).pendingQuestion,
    ).toBeNull();

    const deletedThread = await createTestThread(org.id, customer.id, 'email');
    const deleted = await currentPendingQuestion(deletedThread);
    await db.thread.update({ where: { id: deletedThread.id }, data: { deletedAt: new Date() } });
    await updateContext(org.id, 'q-deleted', { pendingQuestion: deleted });

    expect(
      (await loadLiveOperatorContext(org.id, 'q-deleted', await getContext(org.id, 'q-deleted'))).pendingQuestion,
    ).toBeNull();
  });

  // A question carries no authority to execute, so an absent plan identity is not
  // a reason to discard state the merchant can still answer.
  it('keeps an identity-less question while its thread is open', async () => {
    const customer = await createTestCustomer(org.id, 'q-legacy@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const question: PendingQuestion = { threadId: thread.id, question: 'Which warehouse ships this?' };
    await updateContext(org.id, 'q-legacy', { pendingQuestion: question });

    const loaded = await loadLiveOperatorContext(org.id, 'q-legacy', await getContext(org.id, 'q-legacy'));
    expect(loaded.pendingQuestion).toEqual(question);
  });

  it('leaves a question parked after the turn loaded its own', async () => {
    const customer = await createTestCustomer(org.id, 'q-raced@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const stale = await currentPendingQuestion(thread);
    await updateContext(org.id, 'q-raced', { pendingQuestion: stale });
    const loadedContext = await getContext(org.id, 'q-raced');
    await currentPendingPlan({ thread, instruction: 'refund the customer' });

    // A newer question lands on the row while this turn is still running.
    const newerCustomer = await createTestCustomer(org.id, 'q-newer@example.com');
    const newerThread = await createTestThread(org.id, newerCustomer.id, 'email');
    const newer = await currentPendingQuestion(newerThread);
    await updateContext(org.id, 'q-raced', { pendingQuestion: newer });

    await loadLiveOperatorContext(org.id, 'q-raced', loadedContext);

    expect((await getContext(org.id, 'q-raced')).pendingQuestion).toEqual(newer);
  });

  it('prunes identity-less and version-old parked entries before offering approval', async () => {
    const identitylessCustomer = await createTestCustomer(org.id, 'identityless@example.com');
    const identitylessThread = await createTestThread(org.id, identitylessCustomer.id, 'email');
    const oldVersionCustomer = await createTestCustomer(org.id, 'old-version@example.com');
    const oldVersionThread = await createTestThread(org.id, oldVersionCustomer.id, 'email');
    const current = await currentPendingPlan({ thread: oldVersionThread });
    const row = await db.thread.findUniqueOrThrow({ where: { id: oldVersionThread.id } });
    await db.thread.update({
      where: { id: oldVersionThread.id },
      data: { cachedPlan: { ...(row.cachedPlan as object), version: 6 } },
    });
    await appendPendingPlan(org.id, 'legacy-q', {
      threadId: identitylessThread.id,
      instruction: current.instruction,
      rawToolCalls: current.rawToolCalls,
      // Simulates metadata from an older writer that the current parser drops.
      legacyVersion: 1,
    } as PendingPlan, 3);
    await appendPendingPlan(org.id, 'legacy-q', current, 3);

    const loaded = await loadLiveOperatorContext(org.id, 'legacy-q', await getContext(org.id, 'legacy-q'));
    expect(loaded.pendingPlans).toEqual([]);
    expect((await getContext(org.id, 'legacy-q')).pendingPlans).toEqual([]);
  });
});
