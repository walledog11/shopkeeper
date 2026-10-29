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

// A support conversation parked on a card that is also a durable proposal, plus
// the merchant's queued copy of it. Shared by the revise and dismiss cases
// below, which are the two ways an approval wait ends without being approved.
async function seedCardedSupportTask(memberKey: string, customerName = 'Ray Doe') {
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: randomUUID() },
  });
  const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`, { name: customerName });
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
    const { member, thread } = await seedCardedSupportTask(memberKey, 'Jane Doe');
    const tools = await buildTools(memberKey, member.clerkUserId);

    planAgentSpy.mockResolvedValue({
      instruction: 'Discount request',
      steps: [{ id: 'r1', category: 'write', tool: 'send_reply', label: 'Reply to customer', description: '"Here is 10% off."', enabled: true }],
      rawToolCalls: [{ id: 'r1', name: 'send_reply', input: { text: 'Here is 10% off.' } }],
      warnings: [],
    });

    const result = await tools.revise_pending_plan.execute({ guidance: 'Give them 10% off' }, baseCtx, settings, emptyDeps);

    expect(result.status).toBe('ok');
    expect(result.status).toBe('ok');
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
      expect.objectContaining({ requestDisplay: expect.anything() }),
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
