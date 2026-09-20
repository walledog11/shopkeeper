import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { randomUUID } from 'node:crypto';

const { planAgentSpy, sendOperatorPlanNotificationSpy } = vi.hoisted(() => ({
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
}));

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

import { applyOperatorAnswerReplan } from './operator-answer-replan.js';
import { getContext, updateContext } from '../../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Operator state is keyed to the person, so every transport in these cases writes
// and reads this one queue.
const MEMBER_KEY = 'member:00000000-0000-4000-8000-0000000000aa';
// No OrgMember row backs it in these cases, so the durable continuation finds
// no actor and the re-plan runs untracked — which is what they already asserted.
const CLERK_USER_ID = 'user_operator_answer_replan';

beforeEach(async () => {
  org = await createTestOrg();
  planAgentSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

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

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_1',
    });

    expect(message).toContain('already handled');
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

  it('re-plans, parks the draft, and fans the card out to the other operator channels', async () => {
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

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      endsWait: 'question',
      deliveryRef: 'imessage:chat_2',
    });

    // The return is a model-facing draft summary carrying the concrete draft, not
    // the operator yes/no card.
    expect(message).toContain('Re-drafted');
    expect(message).toContain('Yes, we ship to Canada for $15 flat.');
    expect(message).not.toContain('Reply "yes" to send');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    // The answering device is excluded from the fan-out, so the turn must park the
    // display fields itself or a later "no" here loses the named dismissal.
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
      expect.objectContaining({ exclude: { channel: 'imessage', deliveryKey: 'chat_2' } }),
    );
  });

  describe('durable continuation', () => {
    const budget = {
      runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000,
      spendNanoUsdLimit: 1000000000n,
    };

    // A support conversation waiting on the merchant, the way the inbound
    // planning job leaves one: the customer's message is an accepted request on
    // a task parked with a question any bound member may answer.
    async function seedWaitingSupportTask(options: { pending: boolean }) {
      const member = await db.orgMember.create({
        data: { organizationId: org.id, clerkUserId: randomUUID() },
      });
      const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
      const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
      const custMsg = await createTestMessage(thread.id, 'Can I get a refund?', SenderType.customer);
      if (!options.pending) {
        await createTestMessage(thread.id, 'Looking into it!', SenderType.agent);
      }
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlanMessageId: custMsg.id,
          aiSummary: 'Refund request',
          requestSummary: 'Refund request',
        },
      });
      const { request, task } = await acceptCustomerAgentRequest({
        organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
        objective: 'Refund request', budget,
      });
      const claim = await claimAgentTask({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      });
      await settleAgentTaskClaim({
        organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
        claimToken: claim!.claimToken, requestId: request.id,
        settlement: {
          status: 'waiting_input', question: 'Is this one within policy?',
          answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
        },
      });
      return { member, thread, custMsg, taskId: task.id };
    }

    function refundPlan(): AgentPlan {
      return {
        instruction: 'Refund request',
        steps: [
          {
            id: 'refund_1', tool: 'create_refund', label: 'Refund',
            description: 'Issue the refund', category: 'action', enabled: true,
          },
          {
            id: 'send_1', tool: 'send_reply', label: 'Reply',
            description: 'Tell the customer', category: 'communication', enabled: true,
          },
        ],
        rawToolCalls: [
          { id: 'refund_1', name: 'create_refund', input: { order_id: 'gid://shopify/Order/1', amount: '10.00', currency: 'USD' } },
          { id: 'send_1', name: 'send_reply', input: { text: "You're all set." } },
        ],
        routingEvidence: { classifierState: 'not_applicable', codes: [] },
        validation: { status: 'valid', issues: [] },
        warnings: [],
      };
    }

    // The same conversation waiting on a *card* rather than a question: the
    // attempt parked a proposal any bound member may approve, which is what the
    // merchant's revision guidance supersedes.
    async function seedCardedSupportTask() {
      const member = await db.orgMember.create({
        data: { organizationId: org.id, clerkUserId: randomUUID() },
      });
      const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
      const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
      const custMsg = await createTestMessage(thread.id, 'Can I get a refund?', SenderType.customer);
      const cacheRecord = buildAgentPlanCacheRecord({
        instruction: 'Refund request',
        lastCustomerMessageId: custMsg.id,
        settings: resolveAgentSettings(null),
        plan: refundPlan(),
      });
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: cacheRecord as object,
          cachedPlanMessageId: custMsg.id,
          aiSummary: 'Refund request',
          requestSummary: 'Refund request',
        },
      });
      const { request, task } = await acceptCustomerAgentRequest({
        organizationId: org.id, threadId: thread.id, sourceMessageId: custMsg.id,
        objective: 'Refund request', budget,
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
            proposalId: cacheRecord.planId!,
            instruction: 'Refund request',
            rawToolCalls: refundPlan().rawToolCalls,
            sourceRequestIds: [request.id],
          },
          approver: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
        },
      });
      return { member, thread, taskId: task.id, proposalId: cacheRecord.planId! };
    }

    it('continues the task the card it revised was parked on', async () => {
      const { member, thread, taskId, proposalId } = await seedCardedSupportTask();
      planAgentSpy.mockResolvedValue({
        ...refundPlan(),
        rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Refunded — sorry about that.' } }],
      });

      await applyOperatorAnswerReplan({
        organizationId: org.id,
        memberKey: `member:${member.id}`,
        clerkUserId: member.clerkUserId,
        threadId: thread.id,
        answer: 'Make it warmer and mention the delay.',
        endsWait: 'proposal',
        deliveryRef: 'telegram:chat_9',
      });

      // One task, advanced — not a second one beside it, and not left parked on
      // the card the merchant just replaced.
      expect(await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } }))
        .toMatchObject({ status: 'superseded' });
      const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
      expect(settled).toMatchObject({ status: 'waiting_approval', claimToken: null });
      expect(settled.activeProposalId).not.toBe(proposalId);
      const cached = await db.thread.findUniqueOrThrow({
        where: { id: thread.id }, select: { cachedPlan: true },
      });
      // The new card names the new proposal, which is what stops the approval
      // that follows from falling back to the path that predates them.
      expect(settled.activeProposalId).toBe((cached.cachedPlan as { planId?: string }).planId);
      expect(await db.agentTask.count({ where: { threadId: thread.id } })).toBe(1);
    });

    it('leaves the card parked when the guidance comes from outside the organization', async () => {
      const { thread, taskId, proposalId } = await seedCardedSupportTask();
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
        answer: 'Make it warmer.',
        endsWait: 'proposal',
      })).rejects.toThrow('membership');

      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } }))
        .toMatchObject({ status: 'waiting_approval', activeProposalId: proposalId });
      expect((await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })).status)
        .toBe('ready');
      await cleanupTestData(outsiderOrg.id);
    });

    it('ends the wait its answer was asked under and records the re-drafted card as a proposal', async () => {
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: true });
      planAgentSpy.mockResolvedValue(refundPlan());

      await applyOperatorAnswerReplan({
        organizationId: org.id,
        memberKey: `member:${member.id}`,
        clerkUserId: member.clerkUserId,
        threadId: thread.id,
        answer: 'Yes, refund it.',
        endsWait: 'question',
        deliveryRef: 'telegram:chat_9',
      });

      expect(planAgentSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.anything(),
        undefined,
      );

      const settled = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
      expect(settled).toMatchObject({
        status: 'waiting_approval', claimToken: null,
        pendingQuestion: null, pendingAnswererKey: null,
      });
      // The card the merchant now holds is the proposal the task waits on, and
      // it is theirs to approve rather than the customer's.
      const cached = await db.thread.findUniqueOrThrow({
        where: { id: thread.id }, select: { cachedPlan: true },
      });
      const planId = (cached.cachedPlan as { planId?: string } | null)?.planId;
      expect(settled.activeProposalId).toBe(planId);
      expect(await db.agentProposal.findUniqueOrThrow({ where: { id: settled.activeProposalId! } }))
        .toMatchObject({ taskId, status: 'ready', approverScopeKey: ANY_MEMBER_ACTOR_KEY });
    });

    it('closes the task when the ticket was already handled', async () => {
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: false });

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
      const { member, thread, taskId } = await seedWaitingSupportTask({ pending: true });
      planAgentSpy.mockRejectedValue(new Error('boom'));

      const message = await applyOperatorAnswerReplan({
        organizationId: org.id,
        memberKey: `member:${member.id}`,
        clerkUserId: member.clerkUserId,
        threadId: thread.id,
        answer: 'Yes, refund it.',
        endsWait: 'question',
      });

      expect(message).toContain("couldn't draft the reply");
      expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
        status: 'failed', failureCode: 'answer_replan_failed', claimToken: null,
      });
    });

    it('leaves an unrelated member\'s conversation alone', async () => {
      const { thread, taskId } = await seedWaitingSupportTask({ pending: true });
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

  it('does nothing destructive and returns an apologetic string when re-plan throws', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada', requestSummary: 'Shipping to Canada' },
    });
    await updateContext(org.id, MEMBER_KEY, { pendingQuestion: { threadId: thread.id, question: 'Ship to Canada?' } });

    planAgentSpy.mockRejectedValue(new Error('boom'));

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      memberKey: MEMBER_KEY,
      clerkUserId: CLERK_USER_ID,
      threadId: thread.id,
      answer: 'Yes, $15 flat.',
      endsWait: 'question',
      deliveryRef: 'telegram:chat_3',
    });

    expect(message).toContain("couldn't draft the reply");
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});
