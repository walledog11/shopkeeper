import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { BaseAgentContext } from '@shopkeeper/agent/context';
import { BadRequestError, ConflictError } from '@shopkeeper/shared/errors';
import {
  ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';

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
  usesExactDraftProposals: vi.fn(() => false),
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
  mockExecuteOperatorAgentTurn.mockResolvedValue({ summary: 'Done.', threadId: 'ticket', actionsPerformed: [] });
  planAgentSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

// A support conversation parked on a card that is also a durable proposal, plus
// the merchant's queued copy of it. Shared by the revise and dismiss cases
// below, which are the two ways an approval wait ends without being approved.
async function seedCardedSupportTask(memberKey: string) {
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: randomUUID() },
  });
  const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`, { name: 'Ray Doe' });
  const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
  const custMsg = await createTestMessage(thread.id, 'Can I get a discount?', SenderType.customer);
  const rawToolCalls = [{ id: 's1', name: 'send_reply', input: { text: 'No discounts, sorry.' } }];
  const cacheRecord = buildAgentPlanCacheRecord({
    instruction: 'Discount request',
    lastCustomerMessageId: custMsg.id,
    settings,
    plan: {
      instruction: 'Discount request',
      steps: [{ id: 's1', category: 'communication', tool: 'send_reply', label: 'Reply', description: 'x', enabled: true }],
      rawToolCalls,
      warnings: [],
    },
  });
  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id,
      aiSummary: 'Discount request', requestSummary: 'Discount request',
    },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
    objective: 'Discount request',
    budget: {
      runtimeVersion: 1, modelCallLimit: 20,
      activeTimeMsLimit: 300000, spendNanoUsdLimit: 1000000000n,
    },
  });
  const claim = await claimAgentTask({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
  });
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: {
      status: 'waiting_approval',
      proposal: {
        proposalId: cacheRecord.planId!, instruction: 'Discount request',
        rawToolCalls, sourceRequestIds: [request.id],
      },
      approver: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
    },
  });
  await updateContext(org.id, memberKey, {
    pendingPlan: {
      threadId: thread.id, instruction: 'Discount request', rawToolCalls,
      planId: cacheRecord.planId!, sourceMessageId: custMsg.id,
    },
  });
  return { member, thread, taskId: task.id, proposalId: cacheRecord.planId! };
}

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
    expect(ctx.actionAuthorityBlock).toMatchObject({ code: 'adjudicated_item_missing' });
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
  });

  // Several plans queued is a "say which one" problem, not an absent one: the
  // merchant did name something real, so the turn keeps its authority.
  it('keeps action authority when the reference is merely ambiguous', async () => {
    const memberKey = 'member:ambiguous';
    for (const threadId of ['ticket_a', 'ticket_b']) {
      await appendPendingPlan(org.id, memberKey, {
        threadId,
        instruction: `refund ${threadId}`,
        rawToolCalls: [{ id: 'tc1', name: 'add_internal_note', input: { text: 'note' } }],
      }, 5);
    }
    const tools = await buildTools(memberKey);
    const ctx = { ...baseCtx } as BaseAgentContext;

    const result = await tools.approve_pending_plan.execute({}, ctx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect(ctx.actionAuthorityBlock).toBeUndefined();
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
      summary: 'Error: message dispatch failed (500). Reference: req-1.',
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
      summary: 'Refunded Sarah.', threadId: 'thread_sarah', actionsPerformed: [],
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

describe('reject_pending_plan', () => {
  it('durably clears a valid cached plan as well as the parked copy', async () => {
    const memberKey = 'member:reject-valid';
    const customer = await createTestCustomer(org.id, 'valid-dismiss@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Please reply', SenderType.customer);
    const cache = buildAgentPlanCacheRecord({
      instruction: 'Reply',
      lastCustomerMessageId: message.id,
      settings,
      plan: {
        instruction: 'Reply',
        steps: [{ id: 'send_1', tool: 'send_reply', label: 'Reply', description: 'Reply', category: 'communication', enabled: true }],
        rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Hello' } }],
        validation: { status: 'valid', issues: [] },
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cache as object, cachedPlanMessageId: message.id },
    });
    await updateContext(org.id, memberKey, {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Reply',
        rawToolCalls: cache.plan.rawToolCalls.map(({ id, name, input }) => ({ id, name, input })),
        planId: cache.planId!,
        validation: { status: 'valid', issues: [] },
      },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result).toEqual({ status: 'ok', message: 'Plan dismissed.' });
    expect((await getContext(org.id, memberKey)).pendingPlan).toBeNull();
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).toBeNull();
  });

  it('durably clears the exact cached invalid plan as well as the parked copy', async () => {
    const memberKey = 'member:reject-invalid';
    const customer = await createTestCustomer(org.id, 'invalid-dismiss@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Please reply', SenderType.customer);
    const validation = {
      status: 'invalid' as const,
      issues: [{ code: 'invalid_tool_input' as const, message: 'The reply text cannot be blank.' }],
    };
    const cache = buildAgentPlanCacheRecord({
      instruction: 'Reply',
      lastCustomerMessageId: message.id,
      settings,
      plan: {
        instruction: 'Reply',
        steps: [],
        rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: '' } }],
        validation,
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cache as object, cachedPlanMessageId: message.id },
    });
    await updateContext(org.id, memberKey, {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Reply',
        rawToolCalls: cache.plan.rawToolCalls.map(({ id, name, input }) => ({ id, name, input })),
        planId: cache.planId!,
        validation,
      },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result).toEqual({ status: 'ok', message: 'Plan dismissed.' });
    expect((await getContext(org.id, memberKey)).pendingPlan).toBeNull();
    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.cachedPlan).toBeNull();
    expect(updated?.cachedPlanMessageId).toBeNull();
  });

  it('clears the pending plan', async () => {
    const memberKey = 'member:reject';
    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: 'ticket', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(memberKey);

    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result).toEqual({ status: 'ok', message: 'Plan dismissed.' });
    expect((await getContext(org.id, memberKey)).pendingPlan).toBeNull();
  });

  // Declining a card ends the same wait approving it ends. It used to end only
  // the merchant's copy: the draft was destroyed and the task stayed
  // `waiting_approval` on a proposal they had already refused.
  it('ends the durable approval wait when the merchant declines the card', async () => {
    const memberKey = 'member:reject-durable';
    const { member, taskId, proposalId } = await seedCardedSupportTask(memberKey);
    const tools = await buildTools(memberKey, member.clerkUserId);

    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result).toEqual({ status: 'ok', message: 'Plan dismissed.' });
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })).status)
      .toBe('rejected');
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
      .toMatchObject({ status: 'cancelled', activeProposalId: null });
  });

  it('errors when no plan is pending', async () => {
    const tools = await buildTools('chat_reject_empty');
    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
  });
});

describe('revise_pending_plan', () => {
  it('records the guidance as a note, re-plans, and re-parks a fresh plan', async () => {
    const memberKey = 'member:revise';
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Can I get a discount?', SenderType.customer);

    // A send_reply cached plan has no ask_operator question — revise guidance is
    // recorded as a plain merchant note, not a Q/A pair.
    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Discount request',
      lastCustomerMessageId: custMsg.id,
      settings,
      plan: {
        instruction: 'Discount request',
        steps: [{ id: 's1', category: 'communication', tool: 'send_reply', label: 'Reply', description: 'x', enabled: true }],
        rawToolCalls: [{ id: 's1', name: 'send_reply', input: { text: 'No discounts, sorry.' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Discount request', requestSummary: 'Discount request' },
    });

    await updateContext(org.id, memberKey, {
      pendingPlan: { threadId: thread.id, instruction: 'Discount request', rawToolCalls: [] },
    });
    const tools = await buildTools(memberKey);

    planAgentSpy.mockResolvedValue({
      instruction: 'Discount request',
      steps: [{ id: 'r1', category: 'write', tool: 'send_reply', label: 'Reply to customer', description: '"Here is 10% off."', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Here is 10% off.' } }],
      warnings: [],
    });

    const result = await tools.revise_pending_plan.execute({ guidance: 'Give them 10% off' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    // The tool result is the model-facing draft summary carrying the concrete draft.
    expect(result.message).toContain('Re-drafted');
    expect(result.message).toContain('Here is 10% off.');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
      orderBy: { sentAt: 'desc' },
    });
    expect(note?.contentText).toBe('Merchant note for the agent: Give them 10% off');

    const updated = await getContext(org.id, memberKey);
    expect(updated.pendingPlan).toMatchObject({ threadId: thread.id, instruction: 'Discount request' });
    expect(updated.pendingPlan?.rawToolCalls).toEqual([
      { id: 'r1', name: 'send_reply', input: { text: 'Here is 10% off.' } },
    ]);
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalledWith(
      org.id,
      thread.id,
      'Jane Doe',
      'email',
      'Discount request',
      expect.anything(),
      'Discount request',
      expect.objectContaining({ exclude: { channel: 'telegram', deliveryKey: 'chat_1' } }),
    );
  });

  // Guidance on a card ends that card's approval wait. Naming the question wait
  // here instead would find no task, re-plan untracked, and park a new card
  // naming no proposal — the shape that lost durable approval for the rest of a
  // conversation's life when a question was answered.
  it('continues the durable task the card it revised was parked on', async () => {
    const memberKey = 'member:revise-durable';
    const { member, taskId, proposalId } = await seedCardedSupportTask(memberKey);
    planAgentSpy.mockResolvedValue({
      instruction: 'Discount request',
      steps: [{ id: 'r1', category: 'communication', tool: 'send_reply', label: 'Reply', description: 'x', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Here is 10% off.' } }],
      warnings: [],
    });
    const tools = await buildTools(memberKey, member.clerkUserId);

    const result = await tools.revise_pending_plan.execute({ guidance: 'Give them 10% off' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })).status)
      .toBe('superseded');
    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(settled.activeProposalId).not.toBe(proposalId);
    expect(settled.claimToken).toBeNull();
  });

  it('errors when no plan is pending', async () => {
    const tools = await buildTools('chat_revise_empty');
    const result = await tools.revise_pending_plan.execute({ guidance: 'x' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(planAgentSpy).not.toHaveBeenCalled();
  });
});

describe('answer_operator_question', () => {
  it('records the answer as a Q/A note, re-plans, clears the question, and parks the draft', async () => {
    const memberKey = 'member:answer';
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Shipping question',
      lastCustomerMessageId: custMsg.id,
      settings,
      plan: {
        instruction: 'Shipping question',
        steps: [{ id: 'a1', category: 'internal', tool: 'ask_operator', label: 'Ask', description: 'x', enabled: true }],
        rawToolCalls: [{ id: 'a1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping question', requestSummary: 'Shipping question' },
    });

    await updateContext(org.id, memberKey, {
      pendingQuestion: { threadId: thread.id, question: 'Do we ship to Canada?' },
    });
    const tools = await buildTools(memberKey);

    planAgentSpy.mockResolvedValue({
      instruction: 'Shipping question',
      steps: [{ id: 'r1', category: 'write', tool: 'send_reply', label: 'Reply to customer', description: '"Yes, $15 flat."', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Yes, $15 flat.' } }],
      warnings: [],
    });

    const result = await tools.answer_operator_question.execute({ answer: 'Yes, $15 flat to Canada.' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    // The tool result is the model-facing draft summary carrying the concrete draft.
    expect(result.message).toContain('Re-drafted');
    expect(result.message).toContain('Yes, $15 flat.');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
      orderBy: { sentAt: 'desc' },
    });
    expect(note?.contentText).toContain('Q: Do we ship to Canada?');
    expect(note?.contentText).toContain('A: Yes, $15 flat to Canada.');

    const updated = await getContext(org.id, memberKey);
    expect(updated.pendingQuestion).toBeNull();
    expect(updated.pendingPlan).toMatchObject({ threadId: thread.id, instruction: 'Shipping question' });
  });

  // The counterpart of the revise case above: an answer ends the question wait,
  // and naming the approval wait instead would supersede a card the merchant
  // never decided.
  it('continues the durable task the question it answered was parked on', async () => {
    const memberKey = 'member:answer-durable';
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const customer = await createTestCustomer(org.id, 'asked@example.com', { name: 'Sam Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: custMsg.id,
        aiSummary: 'Shipping question', requestSummary: 'Shipping question',
      },
    });
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
      objective: 'Shipping question',
      budget: {
        runtimeVersion: 1, modelCallLimit: 20,
        activeTimeMsLimit: 300000, spendNanoUsdLimit: 1000000000n,
      },
    });
    const claim = await claimAgentTask({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: 'waiting_input', question: 'Do we ship to Canada?',
        answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    await updateContext(org.id, memberKey, {
      pendingQuestion: { threadId: thread.id, question: 'Do we ship to Canada?' },
    });
    planAgentSpy.mockResolvedValue({
      instruction: 'Shipping question',
      steps: [{ id: 'r1', category: 'communication', tool: 'send_reply', label: 'Reply', description: 'x', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Yes, $15 flat.' } }],
      warnings: [],
    });
    const tools = await buildTools(memberKey, member.clerkUserId);

    const result = await tools.answer_operator_question.execute({ answer: 'Yes, $15 flat.' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(settled).toMatchObject({ pendingQuestion: null, claimToken: null });
    expect(settled.status).not.toBe('waiting_input');
  });

  it('errors when no question is pending', async () => {
    const tools = await buildTools('chat_answer_empty');
    const result = await tools.answer_operator_question.execute({ answer: 'x' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(planAgentSpy).not.toHaveBeenCalled();
  });
});
