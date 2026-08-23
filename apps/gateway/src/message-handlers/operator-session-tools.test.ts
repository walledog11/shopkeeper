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
import { BadRequestError, ConflictError } from '@shopkeeper/agent/errors';

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

vi.mock('./planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

import { buildOperatorSessionTools } from './operator-session-tools.js';
import { appendPendingPlan, getContext, updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const settings = resolveAgentSettings(null);
// The control tools read only ctx.thread?.id (re-entrancy guard); a bare base
// context is all the executors touch.
const baseCtx = { orgId: 'org', orgName: 'Store', recentMessages: [], shopify: null } as unknown as BaseAgentContext;
const emptyDeps = {} as never;

async function buildTools(memberKey: string) {
  const context = await getContext(org.id, memberKey);
  return buildOperatorSessionTools({
    organizationId: org.id,
    clerkUserId: 'usr_1',
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

describe('approve_pending_plan', () => {
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

  it('errors when no question is pending', async () => {
    const tools = await buildTools('chat_answer_empty');
    const result = await tools.answer_operator_question.execute({ answer: 'x' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(planAgentSpy).not.toHaveBeenCalled();
  });
});
