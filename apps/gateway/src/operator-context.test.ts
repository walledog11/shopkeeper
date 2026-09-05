import { describe, it, expect, afterEach, beforeEach } from 'vitest';
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
  loadLivePendingPlans,
  mostRecentPendingPlan,
  selectPendingPlan,
  updateContext,
  extractOrderNumber,
  type PendingPlan,
  type PendingDigest,
  type PendingQuestion,
} from './operator-context.js';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan } from '@shopkeeper/agent/types';

function planFor(threadId: string, planId: string, overrides: Partial<PendingPlan> = {}): PendingPlan {
  return {
    threadId,
    instruction: `handle ${threadId}`,
    rawToolCalls: [{ id: `tc-${planId}`, name: 'create_refund' }],
    planId,
    ...overrides,
  };
}

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('getContext', () => {
  it('returns default empty shape when no row exists', async () => {
    const ctx = await getContext(org.id, '12345');
    expect(ctx).toEqual({
      pendingPlans: [],
      pendingPlan: null,
      pendingDigest: null,
      pendingQuestion: null,
    });
  });
});

describe('updateContext + getContext round-trip', () => {
  it('persists pendingPlan', async () => {
    const threadId = '00000000-0000-4000-8000-000000000010';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
    };

    await updateContext(org.id, '7000001', { pendingPlan: plan });

    const ctx = await getContext(org.id, '7000001');
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingDigest).toBeNull();
  });

  it('persists the optional display fields the fast path reads', async () => {
    const threadId = '00000000-0000-4000-8000-000000000011';
    const plan: PendingPlan = {
      threadId,
      instruction: 'refund the order',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder' }],
      customerName: 'Sarah Chen',
      actionLabel: 'reply to Sarah',
      validation: {
        status: 'invalid',
        issues: [{
          code: 'ungrounded_customer_reply',
          message: 'The drafted reply contains an unsupported promise.',
          toolCallId: 'tc1',
          tool: 'send_reply',
        }],
      },
      requestDisplay: {
        version: 1,
        kind: 'classified',
        sourceMessageId: 'message-1',
        facts: {
          ask: 'refund',
          subject: 'linen napkins',
          order: '#1024',
          deadline: null,
          deadlineText: null,
          alternative: null,
        },
        noRequest: false,
        topic: 'Refund request',
      },
    };

    await updateContext(org.id, '7000002', { pendingPlan: plan });

    expect((await getContext(org.id, '7000002')).pendingPlan).toEqual(plan);
  });

  it('fails closed on malformed invalid validation metadata without losing the pending plan', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        memberKey: 'malformed-validation',
        pendingPlans: [{
          threadId: 'thread_1',
          instruction: 'reply',
          rawToolCalls: [{ id: 'tc_1', name: 'send_reply' }],
          validation: {
            status: 'invalid',
            issues: [{ code: 'made_up_code', message: 'bad metadata' }],
          },
        }],
      },
    });

    expect((await getContext(org.id, 'malformed-validation')).pendingPlan).toEqual({
      threadId: 'thread_1',
      instruction: 'reply',
      rawToolCalls: [{ id: 'tc_1', name: 'send_reply' }],
      validation: {
        status: 'invalid',
        issues: [{
          code: 'invalid_tool_input',
          message: 'Stored draft validation metadata is malformed.',
        }],
      },
    });
  });

  it('persists pendingDigest', async () => {
    const digest: PendingDigest = {
      items: [
        { threadId: 't1', kind: 'approval', planId: 'p1', needsThreadReview: true },
        { threadId: 't2', kind: 'flagged' },
      ],
      sentAt: new Date().toISOString(),
    };
    await updateContext(org.id, '999', { pendingDigest: digest });
    const ctx = await getContext(org.id, '999');
    expect(ctx.pendingDigest).toEqual(digest);

    // The stored row keeps a derived `threadIds` that the in-memory shape no
    // longer has: the previous deploy's reader requires the key, so a rollback
    // would otherwise find no pending digest. Nothing reads it back — the two
    // disagreeing about the same briefing is the bug this shape replaced.
    const row = await db.operatorContext.findUniqueOrThrow({
      where: { organizationId_memberKey: { organizationId: org.id, memberKey: '999' } },
    });
    expect(row.pendingDigest).toEqual({ ...digest, threadIds: ['t2'] });
  });

  it('persists and clears pendingQuestion', async () => {
    const question: PendingQuestion = {
      threadId: '00000000-0000-4000-8000-000000000030',
      question: 'Do we ship to Canada?',
    };
    await updateContext(org.id, '8000001', { pendingQuestion: question });
    expect((await getContext(org.id, '8000001')).pendingQuestion).toEqual(question);

    await updateContext(org.id, '8000001', { pendingQuestion: null });
    expect((await getContext(org.id, '8000001')).pendingQuestion).toBeNull();
  });

  it('drops a malformed pendingQuestion when reading stored context', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        memberKey: 'malformed-question',
        pendingQuestion: { threadId: 'thread_1' },
      },
    });
    expect((await getContext(org.id, 'malformed-question')).pendingQuestion).toBeNull();
  });

  it('filters malformed JSON fields when reading stored context', async () => {
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        memberKey: 'malformed',
        pendingPlans: [
          {
            threadId: 'thread_1',
            instruction: 'check status',
            rawToolCalls: [{ id: 'tc_1', name: 'get_order' }, { id: 'tc_2' }],
          },
        ],
        // Stored shape, not the in-memory one: a row written before the merged
        // list carries `threadIds` and no `items`.
        pendingDigest: {
          threadIds: ['thread_1', 123],
          sentAt: '2026-06-03T00:00:00.000Z',
        },
      },
    });

    const ctx = await getContext(org.id, 'malformed');

    expect(ctx.pendingPlan).toEqual({
      threadId: 'thread_1',
      instruction: 'check status',
      rawToolCalls: [{ id: 'tc_1', name: 'get_order' }],
    });
    // No `items` key on the stored row: it predates the merged list, so every
    // ordinal it ever showed was a flagged one and it has to keep resolving that
    // way rather than reading as an empty briefing.
    expect(ctx.pendingDigest).toEqual({
      items: [{ threadId: 'thread_1', kind: 'flagged' }],
      sentAt: '2026-06-03T00:00:00.000Z',
    });
  });

  it('clears pendingPlan when set to null', async () => {
    const plan: PendingPlan = { threadId: '00000000-0000-4000-8000-000000000020', instruction: 'do', rawToolCalls: [] };
    await updateContext(org.id, '7', { pendingPlan: plan });
    expect((await getContext(org.id, '7')).pendingPlan).toEqual(plan);

    await updateContext(org.id, '7', { pendingPlan: null });
    expect((await getContext(org.id, '7')).pendingPlan).toBeNull();
  });

  it('resolves the same stable plan on every device without clearing a newer plan', async () => {
    const shared: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000020',
      instruction: 'refund',
      rawToolCalls: [],
      planId: '00000000-0000-4000-8000-000000000021',
      sourceMessageId: '00000000-0000-4000-8000-000000000022',
      planHash: 'a'.repeat(64),
      instructionHash: 'b'.repeat(64),
    };
    await updateContext(org.id, 'device_a', { pendingPlan: shared });
    await updateContext(org.id, 'device_b', { pendingPlan: shared });
    await updateContext(org.id, 'device_new', {
      pendingPlan: { ...shared, planId: '00000000-0000-4000-8000-000000000023' },
    });

    await resolvePendingPlanContexts(org.id, 'device_a', shared);

    expect((await getContext(org.id, 'device_a')).pendingPlan).toBeNull();
    expect((await getContext(org.id, 'device_b')).pendingPlan).toBeNull();
    expect((await getContext(org.id, 'device_new')).pendingPlan?.planId)
      .toBe('00000000-0000-4000-8000-000000000023');
  });

  it('conditionally resolves a legacy plan only on the acting device', async () => {
    const legacy: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000024',
      instruction: 'reply',
      rawToolCalls: [],
    };
    await updateContext(org.id, 'legacy_a', { pendingPlan: legacy });
    await updateContext(org.id, 'legacy_b', { pendingPlan: legacy });
    const newer = { ...legacy, instruction: 'new reply' };
    await updateContext(org.id, 'legacy_a', { pendingPlan: newer });

    await resolvePendingPlanContexts(org.id, 'legacy_a', legacy);

    expect((await getContext(org.id, 'legacy_a')).pendingPlan).toEqual(newer);
    expect((await getContext(org.id, 'legacy_b')).pendingPlan).toEqual(legacy);
  });

  // The identity-less path matches on whole-JSON equality, so the reader has to
  // round-trip the display fields or a dismissal silently stops resolving.
  it('resolves an identity-less plan that carries display fields', async () => {
    const parked: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000025',
      instruction: 'reply',
      rawToolCalls: [],
      customerName: 'Sarah Chen',
      actionLabel: 'reply to Sarah',
    };
    await updateContext(org.id, 'display_a', { pendingPlan: parked });

    const stored = (await getContext(org.id, 'display_a')).pendingPlan;
    expect(stored).not.toBeNull();
    await resolvePendingPlanContexts(org.id, 'display_a', stored!);

    expect((await getContext(org.id, 'display_a')).pendingPlan).toBeNull();
  });
});

describe('updateContext slot isolation', () => {
  it('writes only the named slot and leaves the others as stored', async () => {
    const question: PendingQuestion = {
      threadId: '00000000-0000-4000-8000-000000000040',
      question: 'Do we ship to Canada?',
    };
    await db.operatorContext.create({
      data: { organizationId: org.id, memberKey: 'isolation', pendingQuestion: question },
    });

    const plan: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000041',
      instruction: 'refund',
      rawToolCalls: [],
    };
    await updateContext(org.id, 'isolation', { pendingPlan: plan });

    const ctx = await getContext(org.id, 'isolation');
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingQuestion).toEqual(question);
    expect(ctx.pendingDigest).toBeNull();
  });

  // Demonstrates post-fix behavior: a plan-card fan-out and an operator turn that
  // touch different slots on the same row both land. The guarantee is structural
  // (each call SETs only its own column), so this passes regardless of interleave
  // rather than depending on a specific one.
  it('does not clobber when two different slots are updated concurrently', async () => {
    const digest: PendingDigest = {
      items: [{ threadId: 't1', kind: 'flagged' }],
      sentAt: '2026-07-20T00:00:00.000Z',
    };
    await db.operatorContext.create({
      data: { organizationId: org.id, memberKey: 'concurrent', pendingDigest: digest },
    });

    const plan: PendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000042',
      instruction: 'reply',
      rawToolCalls: [],
    };
    const question: PendingQuestion = {
      threadId: '00000000-0000-4000-8000-000000000043',
      question: 'Which warehouse?',
    };
    await Promise.all([
      updateContext(org.id, 'concurrent', { pendingPlan: plan }),
      updateContext(org.id, 'concurrent', { pendingQuestion: question }),
    ]);

    const ctx = await getContext(org.id, 'concurrent');
    expect(ctx.pendingPlan).toEqual(plan);
    expect(ctx.pendingQuestion).toEqual(question);
    expect(ctx.pendingDigest).toEqual(digest);
  });
});

describe('appendPendingPlan (queue)', () => {
  it('stacks plans across threads, newest last', async () => {
    await appendPendingPlan(org.id, 'q1', planFor('thread-a', 'plan-a'), 3);
    await appendPendingPlan(org.id, 'q1', planFor('thread-b', 'plan-b'), 3);
    await appendPendingPlan(org.id, 'q1', planFor('thread-c', 'plan-c'), 3);

    const ctx = await getContext(org.id, 'q1');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-a', 'plan-b', 'plan-c']);
    expect(ctx.pendingPlan?.planId).toBe('plan-c');
    expect(mostRecentPendingPlan(ctx.pendingPlans)?.planId).toBe('plan-c');
  });

  it('trims the oldest once the depth cap is exceeded', async () => {
    await appendPendingPlan(org.id, 'q2', planFor('thread-a', 'plan-a'), 2);
    await appendPendingPlan(org.id, 'q2', planFor('thread-b', 'plan-b'), 2);
    await appendPendingPlan(org.id, 'q2', planFor('thread-c', 'plan-c'), 2);

    const ctx = await getContext(org.id, 'q2');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b', 'plan-c']);
  });

  it('upserts by threadId — a new plan for the same thread replaces the old one', async () => {
    await appendPendingPlan(org.id, 'q3', planFor('thread-a', 'plan-a1'), 3);
    await appendPendingPlan(org.id, 'q3', planFor('thread-b', 'plan-b'), 3);
    await appendPendingPlan(org.id, 'q3', planFor('thread-a', 'plan-a2'), 3);

    const ctx = await getContext(org.id, 'q3');
    // thread-a has one entry (the newer plan), moved to the end; thread-b intact.
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b', 'plan-a2']);
  });

  it('is idempotent under retry — re-appending the same plan yields one entry', async () => {
    const plan = planFor('thread-a', 'plan-a');
    await appendPendingPlan(org.id, 'q4', plan, 3);
    await appendPendingPlan(org.id, 'q4', plan, 3);
    await appendPendingPlan(org.id, 'q4', plan, 3);

    const ctx = await getContext(org.id, 'q4');
    expect(ctx.pendingPlans).toHaveLength(1);
    expect(ctx.pendingPlans[0]?.planId).toBe('plan-a');
  });

  it('lands both concurrent appends for different threads (row-lock serialization)', async () => {
    await Promise.all([
      appendPendingPlan(org.id, 'q5', planFor('thread-a', 'plan-a'), 5),
      appendPendingPlan(org.id, 'q5', planFor('thread-b', 'plan-b'), 5),
    ]);

    const ctx = await getContext(org.id, 'q5');
    expect(ctx.pendingPlans.map((plan) => plan.planId).sort()).toEqual(['plan-a', 'plan-b']);
  });

  it('removes only the acted plan from a multi-plan queue, leaving siblings', async () => {
    await appendPendingPlan(org.id, 'q6', planFor('thread-a', 'plan-a'), 3);
    await appendPendingPlan(org.id, 'q6', planFor('thread-b', 'plan-b'), 3);

    await resolvePendingPlanContexts(org.id, 'q6', planFor('thread-a', 'plan-a'));

    const ctx = await getContext(org.id, 'q6');
    expect(ctx.pendingPlans.map((plan) => plan.planId)).toEqual(['plan-b']);
  });
});

describe('selectPendingPlan', () => {
  const a = planFor('thread-a', 'plan-a', { customerName: 'Sarah Chen' });
  const b = planFor('thread-b', 'plan-b', { customerName: 'Jake Long' });

  it('errors when nothing is pending', () => {
    expect(selectPendingPlan([])).toEqual({ error: expect.stringContaining('no plan') });
  });

  it('returns the only plan and ignores the ref', () => {
    expect(selectPendingPlan([a], 'whatever')).toEqual({ plan: a });
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

    expect(result).toEqual({ error: expect.stringContaining('Open the thread') });
  });

  it('asks which one when several are pending and no ref is given', () => {
    const result = selectPendingPlan([a, b]);
    expect(result).toEqual({ error: expect.stringContaining('ask which one') });
  });

  it('selects by ordinal, planId, and customer name', () => {
    expect(selectPendingPlan([a, b], '2')).toEqual({ plan: b });
    expect(selectPendingPlan([a, b], 'plan-a')).toEqual({ plan: a });
    expect(selectPendingPlan([a, b], 'sarah')).toEqual({ plan: a });
  });

  it('asks which one on an out-of-range or unmatched ref', () => {
    expect('error' in selectPendingPlan([a, b], '9')).toBe(true);
    expect('error' in selectPendingPlan([a, b], 'nobody')).toBe(true);
  });
});

describe('loadLivePendingPlans', () => {
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

    const pruned = await loadLivePendingPlans(org.id, 'q7', await getContext(org.id, 'q7'));
    expect(pruned.pendingPlans.map((plan) => plan.planId)).toEqual([live.planId]);
    expect(pruned.pendingPlans[0]?.requestDisplay?.kind).toBe('system');
    // The stale entry is also removed from the stored queue.
    expect((await getContext(org.id, 'q7')).pendingPlans.map((plan) => plan.planId)).toEqual([live.planId]);
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

    const loaded = await loadLivePendingPlans(org.id, 'legacy-q', await getContext(org.id, 'legacy-q'));
    expect(loaded.pendingPlans).toEqual([]);
    expect((await getContext(org.id, 'legacy-q')).pendingPlans).toEqual([]);
  });
});

describe('extractOrderNumber', () => {
  it.each([
    ['#1234', '#1234'],
    ['order 1234', '#1234'],
    ['order #1234', '#1234'],
    ['ORDER-1234', '#1234'],
    ['can you refund #99 please', '#99'],
    ['hello', null],
    ['', null],
  ])('extracts from %p', (input, expected) => {
    expect(extractOrderNumber(input)).toBe(expected);
  });
});
