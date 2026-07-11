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

const { mockExecuteOperatorAgentTurn, planAgentSpy, sendOperatorPlanNotificationSpy } = vi.hoisted(() => ({
  mockExecuteOperatorAgentTurn: vi.fn(),
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
}));

vi.mock('./execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: mockExecuteOperatorAgentTurn,
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
import { getContext, updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const settings = resolveAgentSettings(null);
// The control tools read only ctx.thread?.id (re-entrancy guard); a bare base
// context is all the executors touch.
const baseCtx = { orgId: 'org', orgName: 'Store', recentMessages: [], shopify: null } as unknown as BaseAgentContext;
const emptyDeps = {} as never;

async function buildTools(chatId: string) {
  const context = await getContext(org.id, chatId);
  return buildOperatorSessionTools({
    organizationId: org.id,
    clerkUserId: 'usr_1',
    chatId,
    senderRef: `telegram:${chatId}`,
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
  it('executes the stored tool calls verbatim and clears the pending plan', async () => {
    const chatId = 'chat_approve';
    await updateContext(org.id, chatId, {
      pendingPlan: {
        threadId: 'ticket_thread_1',
        instruction: 'refund order #1001',
        rawToolCalls: [
          { id: 'tc1', name: 'add_internal_note', input: { text: 'note' } },
          // Legacy inline-input shape (input spread as sibling keys) — normalized back.
          { id: 'tc2', name: 'update_thread_status', status: 'closed' },
        ],
      },
    });
    const tools = await buildTools(chatId);

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
    expect((await getContext(org.id, chatId)).pendingPlan).toBeNull();
  });

  it('refuses to approve a plan targeting the current thread (re-entrancy guard)', async () => {
    const chatId = 'chat_guard';
    await updateContext(org.id, chatId, {
      pendingPlan: { threadId: 'same_thread', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(chatId);

    const result = await tools.approve_pending_plan.execute(
      {},
      { ...baseCtx, thread: { id: 'same_thread' } } as unknown as BaseAgentContext,
      settings,
      emptyDeps,
    );

    expect(result.status).toBe('error');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
    // The plan is left parked — a guard hit is not a dismissal.
    expect((await getContext(org.id, chatId)).pendingPlan).not.toBeNull();
  });

  it('errors and runs nothing when no plan is pending', async () => {
    const tools = await buildTools('chat_none');
    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(mockExecuteOperatorAgentTurn).not.toHaveBeenCalled();
  });

  it('keeps the pending plan parked when execution throws', async () => {
    const chatId = 'chat_throw';
    mockExecuteOperatorAgentTurn.mockRejectedValueOnce(new Error('boom'));
    await updateContext(org.id, chatId, {
      pendingPlan: { threadId: 'ticket_thread_1', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(chatId);

    const result = await tools.approve_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('error');
    expect((await getContext(org.id, chatId)).pendingPlan).not.toBeNull();
  });
});

describe('reject_pending_plan', () => {
  it('clears the pending plan', async () => {
    const chatId = 'chat_reject';
    await updateContext(org.id, chatId, {
      pendingPlan: { threadId: 'ticket', instruction: 'x', rawToolCalls: [] },
    });
    const tools = await buildTools(chatId);

    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);

    expect(result).toEqual({ status: 'ok', message: 'Plan dismissed.' });
    expect((await getContext(org.id, chatId)).pendingPlan).toBeNull();
  });

  it('errors when no plan is pending', async () => {
    const tools = await buildTools('chat_reject_empty');
    const result = await tools.reject_pending_plan.execute({}, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
  });
});

describe('revise_pending_plan', () => {
  it('records the guidance as a note, re-plans, and re-parks a fresh plan', async () => {
    const chatId = 'chat_revise';
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
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Discount request' },
    });

    await updateContext(org.id, chatId, {
      pendingPlan: { threadId: thread.id, instruction: 'Discount request', rawToolCalls: [] },
    });
    const tools = await buildTools(chatId);

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

    const updated = await getContext(org.id, chatId);
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
      { exclude: { channel: 'telegram', contextKey: chatId } },
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
    const chatId = 'chat_answer';
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
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping question' },
    });

    await updateContext(org.id, chatId, {
      pendingQuestion: { threadId: thread.id, question: 'Do we ship to Canada?' },
    });
    const tools = await buildTools(chatId);

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

    const updated = await getContext(org.id, chatId);
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
