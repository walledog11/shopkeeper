import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { DASHBOARD_DISPATCH_FAILED, formatOperatorDispatchFailure } from '@shopkeeper/agent/message-dispatch';
import type { BaseAgentContext } from '@shopkeeper/agent/context';
import { BadRequestError, ConflictError } from '@shopkeeper/shared/errors';

const { mockExecuteOperatorAgentTurn, planAgentSpy, sendOperatorPlanNotificationSpy } = vi.hoisted(() => ({
  mockExecuteOperatorAgentTurn: vi.fn(),
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
}));

vi.mock('./execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: mockExecuteOperatorAgentTurn,
  executeOperatorApprovedCachedPlan: mockExecuteOperatorAgentTurn,
}));

vi.mock('@shopkeeper/agent/planner', () => ({
  planAgent: planAgentSpy,
}));

vi.mock('../support-plan/planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../support-plan/planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

import { buildOperatorSessionTools } from './operator-session-tools.js';
import { appendPendingPlan, getContext, updateContext } from '../../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const settings = resolveAgentSettings(null);
// The control tools read only ctx.thread?.id (re-entrancy guard); a bare base
// context is all the executors touch.
const baseCtx = { orgId: 'org', orgName: 'Store', recentMessages: [], shopify: null } as unknown as BaseAgentContext;
const emptyDeps = {} as never;

// `clerkUserId` defaults to a member row that does not exist, which is what the
// cases below want: no durable task is reachable, so they exercise the tool
// itself. A case about the ledger passes a real member's id.
async function buildTools(memberKey: string, clerkUserId = 'usr_1') {
  const context = await getContext(org.id, memberKey);
  return buildOperatorSessionTools({
    organizationId: org.id,
    clerkUserId,
    memberKey,
    deliveryRef: 'telegram:chat_1',
    context,
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  mockExecuteOperatorAgentTurn.mockReset();
  mockExecuteOperatorAgentTurn.mockResolvedValue({ outcome: 'committed', summary: 'Done.', threadId: 'ticket', actionsPerformed: [] });
  planAgentSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('approve_pending_plan', () => {
  // 2026-09-10: the merchant's "Yes" named a plan the queue no longer held, the
  // tool errored, and the model went on to attempt the refund itself. The error
  // has to withdraw the turn's authority, not just report itself.
  it('withdraws the turn\'s action authority when nothing is queued', async () => {
    const memberKey = 'member:empty';
    const tools = await buildTools(memberKey);
    const ctx = { ...baseCtx } as BaseAgentContext;

    const result = await tools.approve_pending_plan.execute({}, ctx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(ctx.actionAuthority?.block).toMatchObject({ code: 'adjudicated_item_missing' });
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
  });

  // A number that names no queued plan is the same 2026-09-10 shape as an empty
  // queue, and it shared a code with plain ambiguity, so it kept the turn's
  // authority. Asking which plan needs no action tool: the control tools stay
  // available once authority is withdrawn.
  it.each([
    ['an ambiguous approval', undefined],
    ['a number that names no queued plan', '9'],
  ])('withdraws the turn\'s action authority on %s', async (_label, planRef) => {
    const memberKey = `member:unmatched-${planRef ?? 'none'}`;
    for (const threadId of ['ticket_a', 'ticket_b']) {
      await appendPendingPlan(org.id, memberKey, {
        threadId,
        instruction: `refund ${threadId}`,
        rawToolCalls: [{ id: 'tc1', name: 'add_internal_note', input: { text: 'note' } }],
      }, 5);
    }
    const tools = await buildTools(memberKey);
    const ctx = { ...baseCtx } as BaseAgentContext;

    const result = await tools.approve_pending_plan.execute(planRef ? { plan_ref: planRef } : {}, ctx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(ctx.actionAuthority?.block).toMatchObject({ code: 'adjudicated_item_missing' });
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
  });

  it('keeps an invalid draft parked and executes nothing', async () => {
    const memberKey = 'member:invalid';
    await updateContext(org.id, memberKey, {
      pendingPlan: {
        threadId: 'ticket_thread_1',
        instruction: 'promise a refund',
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Your refund is complete.' } }],
        validation: {
          status: 'invalid',
          issues: [{
            code: 'ungrounded_customer_reply',
            message: 'The drafted reply claims an action that is not in the plan.',
            toolCallId: 'tc1',
            tool: 'send_reply',
          }],
        },
      },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(result.message).toContain('failed validation');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
    expect((await getContext(org.id, memberKey)).pendingPlan?.validation?.status).toBe('invalid');
  });

  it('executes the stored tool calls verbatim and clears the pending plan', async () => {
    const memberKey = 'member:approve';
    await updateContext(org.id, memberKey, {
      pendingPlan: {
        threadId: 'ticket_thread_1',
        instruction: 'refund order #1001',
        rawToolCalls: [
          { id: 'tc1', name: 'add_internal_note', input: { text: 'note' } },
          { id: 'tc2', name: 'update_thread_status', input: { status: 'closed' } },
        ],
      },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(mockExecuteOperatorAgentTurn).toHaveBeenCalledWith({
      orgId: org.id,
      threadId: 'ticket_thread_1',
      instruction: 'refund order #1001',
      approvedToolCalls: [
        { id: 'tc1', name: 'add_internal_note', input: { text: 'note' } },
        { id: 'tc2', name: 'update_thread_status', input: { status: 'closed' } },
      ],
      clerkUserId: 'usr_1',
    });
    expect(result).toEqual({ status: 'ok', message: 'Done.' });
    expect((await getContext(org.id, memberKey)).pendingPlan).toBeNull();
  });

  it('refuses to approve a plan targeting the current thread (re-entrancy guard)', async () => {
    const memberKey = 'member:guard';
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: 'same_thread', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute(
      {},
      { ...baseCtx, thread: { id: 'same_thread' } } as unknown as BaseAgentContext,
      settings,
      emptyDeps,
    );

    expect(result.status).toBe('error');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
    // The plan is left parked — a guard hit is not a dismissal.
    expect((await getContext(org.id, memberKey)).pendingPlan).not.toBeNull();
  });

  it('resolves a stale stable plan on every device after claim rejection', async () => {
    const pendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000031',
      instruction: 'refund order #1001',
      rawToolCalls: [{ id: 'tc1', name: 'create_refund', input: { amount: 5 } }],
      planId: '00000000-0000-4000-8000-000000000032',
      sourceMessageId: '00000000-0000-4000-8000-000000000033',
      planHash: 'a'.repeat(64),
      instructionHash: 'b'.repeat(64),
    };
    await updateContext(org.id, 'device_a', { pendingPlan });
    await updateContext(org.id, 'device_b', { pendingPlan });
    mockExecuteOperatorAgentTurn.mockRejectedValueOnce(new ConflictError('Plan already claimed'));
    const tools = await buildTools('device_a');

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect((await getContext(org.id, 'device_a')).pendingPlan).toBeNull();
    expect((await getContext(org.id, 'device_b')).pendingPlan).toBeNull();
  });

  it('keeps a current stable plan parked when approval needs revision', async () => {
    const pendingPlan = {
      threadId: '00000000-0000-4000-8000-000000000041',
      instruction: 'refund order #1001',
      rawToolCalls: [{ id: 'tc1', name: 'create_refund', input: { amount: 5 } }],
      planId: '00000000-0000-4000-8000-000000000042',
      sourceMessageId: '00000000-0000-4000-8000-000000000043',
      planHash: 'c'.repeat(64),
      instructionHash: 'd'.repeat(64),
    };
    await updateContext(org.id, 'device_a', { pendingPlan });
    await updateContext(org.id, 'device_b', { pendingPlan });
    mockExecuteOperatorAgentTurn.mockRejectedValueOnce(
      new BadRequestError('Changing action steps requires a revised customer reply.'),
    );
    const tools = await buildTools('device_a');

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect((await getContext(org.id, 'device_a')).pendingPlan).toMatchObject({ planId: pendingPlan.planId });
    expect((await getContext(org.id, 'device_b')).pendingPlan).toMatchObject({ planId: pendingPlan.planId });
  });

  it('errors and runs nothing when no plan is pending', async () => {
    const tools = await buildTools('chat_none');
    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
  });

  it('returns a tool error when plan execution reports a dispatch failure', async () => {
    const memberKey = 'member:dispatch_fail';
    mockExecuteOperatorAgentTurn.mockResolvedValueOnce({
      outcome: 'failed',
      summary: formatOperatorDispatchFailure({
        status: 'error',
        result: 'Error: message dispatch failed (500). Reference: req-1.',
        receipt: {
          version: 1, operationId: 'operation-1', executionId: 'execution-1', tool: 'send_reply',
          target: { kind: 'thread', id: 'ticket_thread_1' }, observedAt: '2026-10-27T00:00:00.000Z',
          providerReference: null, outcome: 'failed', code: DASHBOARD_DISPATCH_FAILED,
        },
      }),
      threadId: 'ticket_thread_1',
      actionsPerformed: [],
    });
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: 'ticket_thread_1', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(result.message).toContain("couldn't send the customer message");
    expect((await getContext(org.id, memberKey)).pendingPlan).not.toBeNull();
  });

  it('keeps the pending plan parked when execution throws', async () => {
    const memberKey = 'member:throw';
    mockExecuteOperatorAgentTurn.mockRejectedValueOnce(new Error('boom'));
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: 'ticket_thread_1', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect((await getContext(org.id, memberKey)).pendingPlan).not.toBeNull();
  });

  it('executes the plan named by plan_ref and leaves the sibling queued', async () => {
    const memberKey = 'member:select';
    await appendPendingPlan(org.id, memberKey, {
      threadId: 'thread_sarah', instruction: 'refund Sarah', rawToolCalls: [],
      planId: 'plan-sarah', customerName: 'Sarah Chen',
    }, 3);
    await appendPendingPlan(org.id, memberKey, {
      threadId: 'thread_jake', instruction: 'exchange Jake', rawToolCalls: [],
      planId: 'plan-jake', customerName: 'Jake Long',
    }, 3);
    mockExecuteOperatorAgentTurn.mockResolvedValueOnce({
      outcome: 'committed', summary: 'Refunded Sarah.', threadId: 'thread_sarah', actionsPerformed: [],
    });
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({ plan_ref: 'Sarah' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    // The selected plan — not the most-recent — is the one that executed.
    expect(mockExecuteOperatorAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread_sarah' }),
    );
    // Jake's plan is untouched.
    expect((await getContext(org.id, memberKey)).pendingPlans.map((plan) => plan.planId)).toEqual(['plan-jake']);
  });

  it('asks which plan when several are pending and no ref is given', async () => {
    const memberKey = 'member:ambiguous';
    await appendPendingPlan(org.id, memberKey, {
      threadId: 't1', instruction: 'a', rawToolCalls: [], planId: 'p1', customerName: 'Sarah',
    }, 3);
    await appendPendingPlan(org.id, memberKey, {
      threadId: 't2', instruction: 'b', rawToolCalls: [], planId: 'p2', customerName: 'Jake',
    }, 3);
    const tools = await buildTools(memberKey);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(result.message).toContain('ask which one');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
    // Nothing resolved — both plans still pending.
    expect((await getContext(org.id, memberKey)).pendingPlans).toHaveLength(2);
  });
});
