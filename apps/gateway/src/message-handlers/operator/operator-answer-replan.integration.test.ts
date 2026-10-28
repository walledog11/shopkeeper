import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord, readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  claimAgentTask,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { randomUUID } from 'node:crypto';

const { planAgentSpy, sendOperatorPlanNotificationSpy, anthropicCreate, postDashboardInternal, listBindings, notifyOperator } = vi.hoisted(() => ({
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
  anthropicCreate: vi.fn(),
  postDashboardInternal: vi.fn(),
  listBindings: vi.fn(),
  notifyOperator: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: anthropicCreate };
  },
}));

vi.mock('../../clients/agent-runtime.js', () => ({
  getGatewayLockProvider: () => ({
    acquire: vi.fn(async () => ({ isLost: () => false, release: vi.fn(async () => {}) })),
  }),
}));

vi.mock('../../clients/dashboard-internal.js', () => ({ postDashboardInternal }));

vi.mock('@shopkeeper/agent/planner', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shopkeeper/agent/planner')>(),
  planAgent: planAgentSpy,
}));

vi.mock('../support-plan/planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../support-plan/planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

vi.mock('../../operator-notify.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../operator-notify.js')>(),
  listOperatorBindings: listBindings,
  notifyOperator,
}));

import { applyOperatorAnswerReplan } from './operator-answer-replan.js';
import { appendPendingPlan, getContext, selectPendingPlan, updateContext } from '../../operator-context.js';
import { supportTaskBudget, seedWaitingSupportTask, refundPlan } from '../../test-fixtures/operator-answer-replan-fixtures.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Operator state is keyed to the person, so every transport in these cases writes
// and reads this one queue.
const MEMBER_KEY = `member:${randomUUID()}`;
// The authenticated member is backed by a current organization membership.
const CLERK_USER_ID = 'user_operator_answer_replan';

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { id: MEMBER_KEY.slice("member:".length), organizationId: org.id, clerkUserId: CLERK_USER_ID } });
  planAgentSpy.mockReset();
  listBindings.mockReset();
  listBindings.mockResolvedValue([]);
  notifyOperator.mockReset();
  anthropicCreate.mockReset();
  postDashboardInternal.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

async function parkQuestion(threadId: string) {
  const message = await db.message.findFirstOrThrow({
    where: { threadId, senderType: 'customer' }, orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId, sourceMessageId: message.id,
    objective: 'Answer the customer question',
    budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000, spendNanoUsdLimit: 1000000000n },
  });
  const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: { status: 'waiting_input', question: 'How should I reply?', answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY } },
  });
}

describe('applyOperatorAnswerReplan', () => {
  it('records the answer + KB article and clears state when the ticket was already handled', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    // An agent reply is the latest conversation message — so there is no pending
    // customer message and the re-plan (LLM) path is skipped.
    await createTestMessage(thread.id, 'Thanks for reaching out!', SenderType.agent);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id },
    });

    await parkQuestion(thread.id);
    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_1',
    });

    expect(message.message).toContain('already handled');
    expect(planAgentSpy).not.toHaveBeenCalled();

    // The stale plan cache is cleared.
    const refreshed = await db.thread.findUnique({
      where: { id: thread.id },
      select: { cachedPlan: true, cachedPlanMessageId: true },
    });
    expect(refreshed?.cachedPlan).toBeNull();
    expect(refreshed?.cachedPlanMessageId).toBeNull();

    // The answer is captured as a Q/A note and a reusable KB article.
    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(note?.contentText).toContain('Q: Do we ship to Canada?');
    expect(note?.contentText).toContain('A: Yes, $15 flat to Canada.');

    const article = await db.kbArticle.findFirst({ where: { organizationId: org.id } });
    expect(article?.title).toBe('International shipping');
    expect(article?.body).toContain('Q: Do we ship to Canada?');
    expect(article?.body).toContain('A: Yes, $15 flat to Canada.');
    expect(article?.tags).toEqual(['agent-learned', 'shipping']);
  });

  it('re-plans, parks the draft, and delivers its card to every operator channel', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada', requestSummary: 'Shipping to Canada' },
    });

    const replannedPlan = {
      instruction: 'Shipping to Canada',
      steps: [{
        id: 'tc_reply',
        category: 'write',
        tool: 'send_reply',
        label: 'Reply to customer',
        description: '"Yes, we ship to Canada for $15 flat."',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      warnings: [],
    };
    planAgentSpy.mockResolvedValue(replannedPlan);

    await parkQuestion(thread.id);
    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'imessage:chat_2',
    });

    expect(message.status).toBe('replanned');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    // The answering member keeps a queue entry even without a phone binding.
    const updatedCtx = await getContext(org.id, MEMBER_KEY);
    expect(updatedCtx.pendingPlan).toMatchObject({
      threadId: thread.id,
      instruction: 'Shipping to Canada',
      customerName: 'Jane Doe',
      actionLabel: 'reply to Jane',
    });

    // The operator card still fans out to the merchant's other bound channels.
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalledWith(
      org.id,
      thread.id,
      'Jane Doe',
      'email',
      'Shipping to Canada',
      expect.objectContaining({
        rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      }),
      'Shipping to Canada',
      expect.objectContaining({ requestDisplay: expect.anything() }),
    );
  });

  it.each([900, 3100])('publishes the complete revised card or refuses phone approval for a %s-character draft', async length => {
    const customer = await createTestCustomer(org.id, 'draft@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    await createTestMessage(thread.id, 'Can you explain the return process?', SenderType.customer);
    const draft = 'x'.repeat(length);
    const memberId = MEMBER_KEY.slice('member:'.length);
    listBindings.mockResolvedValue([{ channel: 'imessage', orgMemberId: memberId, senderId: 'answering-phone', spaceId: 'space' }]);
    let deliveredCard = '';
    notifyOperator.mockImplementation(async (_orgId, _binding, body, _patch, options) => {
      deliveredCard = body;
      await appendPendingPlan(org.id, MEMBER_KEY, options.appendPlan.plan, options.appendPlan.maxDepth);
      return { channel: 'imessage', chatId: 'answering-phone' };
    });
    const nativeNotifications = await vi.importActual<typeof import('../support-plan/planning-notifications.js')>('../support-plan/planning-notifications.js');
    sendOperatorPlanNotificationSpy.mockImplementation(nativeNotifications.sendOperatorPlanNotification);
    planAgentSpy.mockResolvedValue({
      instruction: 'Return process with merchant guidance', warnings: [],
      steps: [{ id: 'reply', tool: 'send_reply', category: 'communication', label: 'Reply', description: 'Reply', enabled: true }],
      rawToolCalls: [{ id: 'reply', name: 'send_reply', input: { text: draft } }],
      communication: { mode: 'exact_draft', destination: { kind: 'thread', id: thread.id, channel: 'email' }, draft, allowedResultBindings: [] },
    });
    await parkQuestion(thread.id);
    const result = await applyOperatorAnswerReplan({
      organizationId: org.id, memberKey: MEMBER_KEY, clerkUserId: CLERK_USER_ID,
      threadId: thread.id, answer: 'Explain the policy in full.', endsWait: 'question', deliveryRef: 'imessage:answering-phone',
    });
    expect(result.status).toBe('replanned');
    const pending = (await getContext(org.id, MEMBER_KEY)).pendingPlans;
    if (length < 3000) {
      expect(deliveredCard).toContain(draft);
      expect(selectPendingPlan(pending)).toHaveProperty('plan');
    } else {
      expect(deliveredCard).not.toContain(draft);
      expect(selectPendingPlan(pending)).toMatchObject({ code: 'needs_thread_review' });
    }
  });

  it('leaves the question in place when re-plan throws', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada', requestSummary: 'Shipping to Canada' },
    });
    await updateContext(org.id, MEMBER_KEY, { pendingQuestion: { threadId: thread.id, question: 'Ship to Canada?' } });

    planAgentSpy.mockRejectedValue(new Error('boom'));

    await parkQuestion(thread.id);
    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_3',
    });

    expect(message.message).toContain("couldn't draft the reply");
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});

describe('applyOperatorAnswerReplan durable continuation', () => {

  function replyPlan(threadId: string): AgentPlan {
    return {
      instruction: 'Refund request', warnings: [],
      steps: [{ id: 'reply', tool: 'send_reply', category: 'communication', label: 'Reply', description: 'Reply', enabled: true }],
      rawToolCalls: [{ id: 'reply', name: 'send_reply', input: { text: 'We can accept the return.' } }],
      communication: {
        mode: 'exact_draft', destination: { kind: 'thread', id: threadId, channel: 'email' },
        draft: 'We can accept the return.', allowedResultBindings: [],
      },
    };
  }

  // The dashboard's answer form reaches this continuation through the gateway,
  // so these hold for an answer from any surface.
  it.each(['budget', 'cancelled', 'claim_lost', 'new_customer_message'] as const)(
    'publishes nothing after %s', async (reason) => {
      const { member, thread, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
      if (reason === 'budget') {
        await db.agentTask.update({ where: { id: taskId }, data: { modelCallsUsed: supportTaskBudget.modelCallLimit } });
      }
      planAgentSpy.mockImplementation(async (ctx) => {
        await ctx.taskBudget.reserveModelCall();
        if (reason === 'cancelled') {
          await db.agentTask.update({ where: { id: taskId }, data: { cancelledAt: new Date() } });
        } else if (reason === 'claim_lost') {
          await db.agentTask.update({ where: { id: taskId }, data: { claimToken: randomUUID() } });
        } else if (reason === 'new_customer_message') {
          await createTestMessage(thread.id, 'Actually, cancel the return.', SenderType.customer);
        }
        return replyPlan(thread.id);
      });

      const result = await applyOperatorAnswerReplan({
        organizationId: org.id, memberKey: `member:${member.id}`, clerkUserId: member.clerkUserId,
        threadId: thread.id, answer: 'Yes, accept it.', endsWait: 'question', saveToKb: false,
      });

      expect(result.status).toBe('failed');
      expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan).toBeNull();
      expect(await db.agentProposal.count({ where: { taskId } })).toBe(0);
    },
  );

  it('commits a receipt-bound proposal with the original customer source and cumulative usage', async () => {
    const { member, thread, custMsg, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
    await db.agentTask.update({ where: { id: taskId }, data: { modelCallsUsed: 2, inputTokensUsed: 10, outputTokensUsed: 5 } });
    planAgentSpy.mockImplementation(async (ctx) => {
      await ctx.taskBudget.reserveModelCall();
      await ctx.taskBudget.recordModelUsage({ inputTokens: 20, outputTokens: 8, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, 'claude-haiku-4-5-20251001');
      return { ...replyPlan(thread.id), instruction: 'Expanded merchant answer planning context' };
    });

    const result = await applyOperatorAnswerReplan({
      organizationId: org.id, memberKey: `member:${member.id}`, clerkUserId: member.clerkUserId,
      threadId: thread.id, answer: 'Yes, accept it.', endsWait: 'question', saveToKb: false,
    });

    expect(result.status).toBe('replanned');
    const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    const cached = readAgentPlanCache((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan)!;
    expect(settled).toMatchObject({ status: 'waiting_approval', activeProposalId: cached.planId, modelCallsUsed: 3, inputTokensUsed: 30, outputTokensUsed: 13 });
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: cached.planId! } });
    const source = await db.agentRequest.findUniqueOrThrow({ where: { id: (proposal.sourceRequestIds as string[])[0] } });
    expect(source).toMatchObject({ sourceMessageId: custMsg.id, actorKind: 'member', taskId });
    // Off, the answer directs this re-plan only.
    expect(await db.kbArticle.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it.each(['budget', 'cancelled', 'claim_lost', 'expired', 'new_customer_message'] as const)(
    'does not publish a continuation after %s prevents settlement', async (reason) => {
      const { member, thread, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
      const memberKey = `member:${member.id}`;
      if (reason === 'budget') {
        await db.agentTask.update({ where: { id: taskId }, data: { modelCallsUsed: supportTaskBudget.modelCallLimit } });
      }
      planAgentSpy.mockImplementation(async (ctx) => {
        await ctx.taskBudget.reserveModelCall();
        if (reason === 'cancelled') {
          await db.agentTask.update({ where: { id: taskId }, data: { cancelledAt: new Date() } });
        } else if (reason === 'claim_lost') {
          await db.agentTask.update({ where: { id: taskId }, data: { claimToken: randomUUID() } });
        } else if (reason === 'expired') {
          await db.agentTask.update({ where: { id: taskId }, data: { leaseExpiresAt: new Date(0) } });
        } else if (reason === 'new_customer_message') {
          await createTestMessage(thread.id, 'Please cancel that request instead.', SenderType.customer);
        }
        return refundPlan();
      });
      const result = await applyOperatorAnswerReplan({
        organizationId: org.id, memberKey, clerkUserId: member.clerkUserId,
        threadId: thread.id, answer: 'Yes, refund it.', endsWait: 'question',
      });
      expect(result.status).toBe('failed');
      expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan).toBeNull();
      expect((await getContext(org.id, memberKey)).pendingPlans).toHaveLength(0);
      expect(await db.agentProposal.count({ where: { taskId } })).toBe(0);
      expect(await db.agentAction.count({ where: { taskId } })).toBe(0);
      if (reason === 'budget') {
        expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).modelCallsUsed).toBe(supportTaskBudget.modelCallLimit);
      }
    },
  );

  it('closes the task when the ticket was already handled', async () => {
    const { member, thread, taskId } = await seedWaitingSupportTask(org.id, { pending: false });

    await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: 'Yes, refund it.',
      endsWait: 'question',
    });

    expect(planAgentSpy).not.toHaveBeenCalled();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'completed', claimToken: null, pendingQuestion: null,
    });
  });

  it('fails the task rather than leaving it claimed when the re-plan produces nothing', async () => {
    const { member, thread, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
    planAgentSpy.mockRejectedValue(new Error('boom'));

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: `member:${member.id}`,
      clerkUserId: member.clerkUserId,
      threadId: thread.id,
      answer: 'Yes, refund it.',
      endsWait: 'question',
    });

    expect(message.message).toContain("couldn't draft the reply");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'failed', failureCode: 'answer_replan_failed', claimToken: null,
    });
  });

  it('leaves an unrelated member\'s conversation alone', async () => {
    const { thread, taskId } = await seedWaitingSupportTask(org.id, { pending: true });
    const outsiderOrg = await createTestOrg();
    const outsider = await db.orgMember.create({
      data: { organizationId: outsiderOrg.id, clerkUserId: randomUUID() },
    });
    planAgentSpy.mockResolvedValue(refundPlan());

    await expect(applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: outsider.clerkUserId,
      threadId: thread.id,
      answer: 'Yes, refund it.',
      endsWait: 'question',
    })).rejects.toThrow('membership');

    expect(planAgentSpy).not.toHaveBeenCalled();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: 'waiting_input', pendingQuestion: 'Is this one within policy?',
    });
    await cleanupTestData(outsiderOrg.id);
  });
});
