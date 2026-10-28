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
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  claimAgentTask,
  settleAgentTaskClaim,
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
}));

vi.mock('../support-plan/planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../support-plan/planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

import { buildOperatorSessionTools } from './operator-session-tools.js';
import { getContext, updateContext } from '../../operator-context.js';

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

async function seedQuestionTask(threadId: string, sourceMessageId: string, objective: string, question: string) {
  await db.orgMember.upsert({
    where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: 'usr_1' } },
    create: { organizationId: org.id, clerkUserId: 'usr_1' }, update: {},
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId, sourceMessageId, objective,
    budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000, spendNanoUsdLimit: 1000000000n },
  });
  const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
  if (!claim) throw new Error('Could not claim the question fixture');
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision, claimToken: claim.claimToken, requestId: request.id,
    settlement: { status: 'waiting_input', question, answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY } },
  });
}

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
    await seedQuestionTask(thread.id, custMsg.id, 'Shipping question', 'Do we ship to Canada?');
    const tools = await buildTools(memberKey);

    planAgentSpy.mockResolvedValue({
      instruction: 'Shipping question',
      steps: [{ id: 'r1', category: 'write', tool: 'send_reply', label: 'Reply to customer', description: '"Yes, $15 flat."', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Yes, $15 flat.' } }],
      warnings: [],
    });

    const result = await tools.answer_operator_question.execute({ answer: 'Yes, $15 flat to Canada.' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    expect(result.status).toBe('ok');
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
        runtimeVersion: 2, modelCallLimit: 20,
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

  it.each(['planning_failed', 'claim_unavailable', 'replacement_question'] as const)(
    'preserves the pending question when %s', async (reason) => {
      const memberKey = 'member:answer-retained';
      const customer = await createTestCustomer(org.id, 'retained@example.com');
      const thread = await createTestThread(org.id, customer.id, 'email');
      const customerMessage = await createTestMessage(thread.id, 'Can I return this?', SenderType.customer);
      const question = { threadId: thread.id, question: 'Should I open the return?', planId: randomUUID() };
      await updateContext(org.id, memberKey, { pendingQuestion: question });
      const replacement = { ...question, planId: randomUUID(), question: 'Which label should I send?' };
      if (reason !== 'claim_unavailable') {
        await seedQuestionTask(thread.id, customerMessage.id, 'Open a return', question.question);
      }
      if (reason === 'claim_unavailable') {
        await acceptCustomerAgentRequest({
          organizationId: org.id, threadId: thread.id,
          sourceMessageId: (await db.message.findFirstOrThrow({ where: { threadId: thread.id, senderType: 'customer' } })).id,
          objective: 'Open a return',
          budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000, spendNanoUsdLimit: 1000000000n },
        });
      } else if (reason === 'planning_failed') {
        planAgentSpy.mockRejectedValue(new Error('provider unavailable'));
      } else {
        planAgentSpy.mockImplementation(async () => {
          await updateContext(org.id, memberKey, { pendingQuestion: replacement });
          return {
            instruction: 'Return request', steps: [], rawToolCalls: [], warnings: [],
          };
        });
      }
      const tools = await buildTools(memberKey);
      if (reason === 'claim_unavailable') {
        await expect(tools.answer_operator_question.execute({ answer: 'Yes' }, baseCtx, settings, emptyDeps)).rejects.toThrow();
      } else {
        const result = await tools.answer_operator_question.execute({ answer: 'Yes' }, baseCtx, settings, emptyDeps);
        expect(result.status).toBe(reason === 'planning_failed' ? 'error' : 'ok');
      }
      expect((await getContext(org.id, memberKey)).pendingQuestion).toEqual(reason === 'replacement_question' ? replacement : question);
    },
  );

  it('errors when no question is pending', async () => {
    const tools = await buildTools('chat_answer_empty');
    const result = await tools.answer_operator_question.execute({ answer: 'x' }, baseCtx, settings, emptyDeps);
    expect(result.status).toBe('error');
    expect(planAgentSpy).not.toHaveBeenCalled();
  });
});
