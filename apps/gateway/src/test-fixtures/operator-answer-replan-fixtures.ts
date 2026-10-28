// Support tasks parked on a question or a card, as the operator-answer replan suites seed them.
import { db, SenderType } from '@shopkeeper/db';
import { createTestCustomer, createTestThread, createTestMessage } from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  claimAgentTask,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { randomUUID } from 'node:crypto';

export const supportTaskBudget = {
  runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 300000,
  spendNanoUsdLimit: 1000000000n,
};

export // A support conversation waiting on the merchant, the way the inbound
// planning job leaves one: the customer's message is an accepted request on
// a task parked with a question any bound member may answer.
async function seedWaitingSupportTask(orgId: string, options: {
  pending: boolean;
  customerText?: string;
  objective?: string;
  question?: string;
}) {
  const member = await db.orgMember.create({
    data: { organizationId: orgId, clerkUserId: randomUUID() },
  });
  const customer = await createTestCustomer(orgId, 'cust@example.com', { name: 'Jane Doe' });
  const thread = await createTestThread(orgId, customer.id, 'email', { tag: 'Support' });
  const custMsg = await createTestMessage(
    thread.id, options.customerText ?? 'Can I get a refund?', SenderType.customer,
  );
  if (!options.pending) {
    await createTestMessage(thread.id, 'Looking into it!', SenderType.agent);
  }
  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: custMsg.id,
      aiSummary: 'Refund request',
      requestSummary: options.objective ?? 'Refund request',
    },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: orgId, threadId: thread.id, sourceMessageId: custMsg.id,
    objective: options.objective ?? 'Refund request', budget: supportTaskBudget,
  });
  const claim = await claimAgentTask({
    organizationId: orgId, taskId: task.id, expectedRevision: task.revision,
  });
  await settleAgentTaskClaim({
    organizationId: orgId, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: {
      status: 'waiting_input', question: options.question ?? 'Is this one within policy?',
      answerer: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
    },
  });
  return { member, thread, custMsg, taskId: task.id };
}

export // The same conversation waiting on a *card* rather than a question: the
// attempt parked a proposal any bound member may approve, which is what the
// merchant's revision guidance supersedes.
async function seedCardedSupportTask(orgId: string, options?: {
  customerText?: string;
  objective?: string;
  plan?: AgentPlan;
  shopifyCustomerId?: string;
}) {
  const objective = options?.objective ?? 'Refund request';
  const plan = options?.plan ?? refundPlan();
  const member = await db.orgMember.create({
    data: { organizationId: orgId, clerkUserId: randomUUID() },
  });
  const customer = await createTestCustomer(orgId, 'cust@example.com', { name: 'Jane Doe' });
  const thread = await createTestThread(orgId, customer.id, 'email', {
    tag: 'Support',
    ...(options?.shopifyCustomerId ? { shopifyCustomerId: options.shopifyCustomerId } : {}),
  });
  const custMsg = await createTestMessage(
    thread.id,
    options?.customerText ?? 'Can I get a refund?',
    SenderType.customer,
  );
  const cacheRecord = buildAgentPlanCacheRecord({
    instruction: objective,
    lastCustomerMessageId: custMsg.id,
    settings: resolveAgentSettings(null),
    plan,
  });
  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlan: cacheRecord as object,
      cachedPlanMessageId: custMsg.id,
      aiSummary: objective,
      requestSummary: objective,
    },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: orgId, threadId: thread.id, sourceMessageId: custMsg.id,
    objective, budget: supportTaskBudget,
  });
  const claim = await claimAgentTask({
    organizationId: orgId, taskId: task.id, expectedRevision: task.revision,
  });
  await settleAgentTaskClaim({
    organizationId: orgId, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: {
      status: 'waiting_approval',
      proposal: {
        proposalId: cacheRecord.planId!,
        instruction: objective,
        rawToolCalls: plan.rawToolCalls,
        sourceRequestIds: [request.id],
      },
      approver: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
    },
  });
  return { member, thread, taskId: task.id, proposalId: cacheRecord.planId! };
}

export function refundPlan(): AgentPlan {
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

export function actionPlan(
  instruction: string,
  tool: 'create_return' | 'create_exchange' | 'update_shopify_customer_info' | 'add_shopify_customer_note',
  input: Record<string, unknown>,
): AgentPlan {
  return {
    instruction,
    steps: [{
      id: 'action_1', tool,
      label: tool === 'create_return'
        ? 'Open return'
        : tool === 'create_exchange'
          ? 'Open exchange'
          : tool === 'update_shopify_customer_info'
            ? 'Update customer info'
            : 'Add customer note',
      description: instruction, category: 'action', enabled: true,
    }],
    rawToolCalls: [{ id: 'action_1', name: tool, input }],
    communication: { mode: 'none' },
    routingEvidence: { classifierState: 'not_applicable', codes: [] },
    validation: { status: 'valid', issues: [] },
    warnings: [],
  };
}

export // What the planner returns on a v2 task: the write and the exact reply the
// card shows with it, bound to the thread it is planning for.
function withExactReply(plan: AgentPlan, text: string) {
  return async (ctx: { thread: { id: string; channelType: string } }): Promise<AgentPlan> => ({
    ...plan,
    rawToolCalls: [...plan.rawToolCalls, { id: 'reply', name: 'send_reply', input: { text } }],
    communication: {
      mode: 'exact_draft',
      destination: { kind: 'thread', id: ctx.thread.id, channel: ctx.thread.channelType },
      draft: text,
      allowedResultBindings: [],
    },
  });
}
