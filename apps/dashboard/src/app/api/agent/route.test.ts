import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim } from '@shopkeeper/agent/task-ledger';
import type { AgentPlan } from '@/types';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockExecuteAgentTurn } = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn(),
}));

vi.mock('@shopkeeper/agent/turn', () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock('@/lib/agent/runner', () => ({
  hashInstructionForLog: vi.fn(() => 'test-hash'),
  buildContext: vi.fn(),
  runAgent: vi.fn(),
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: 'usr_test' } });
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockExecuteAgentTurn.mockResolvedValue({ summary: 'Plan executed.', actionsPerformed: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

async function createThreadWithCachedPlan(plan: AgentPlan, instruction = 'Handle this', durable = true) {
  const customer = await createTestCustomer(org.id, `customer-${crypto.randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const message = await createTestMessage(thread.id, 'Please help with my order');
  const settings = resolveAgentSettings(null);
  if (durable) {
    const reply = plan.rawToolCalls.find((call) => call.name === 'send_reply');
    const replyInput = reply?.input as { text?: unknown } | undefined;
    plan.communication = {
      mode: 'exact_draft', destination: { kind: 'thread', id: thread.id, channel: thread.channelType },
      draft: typeof replyInput?.text === 'string' ? replyInput.text : '', allowedResultBindings: [],
    };
  }
  const cachedPlan = buildAgentPlanCacheRecord({ instruction, lastCustomerMessageId: message.id, settings, plan });

  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: message.id,
      cachedPlan: cachedPlan as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
    },
  });

  if (durable) {
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id, objective: instruction,
      budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: BigInt(1000000000) },
    });
    const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
    if (!claim) throw new Error('Could not claim the approval fixture');
    await settleAgentTaskClaim({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision, claimToken: claim.claimToken, requestId: request.id,
      settlement: {
        status: 'waiting_approval',
        proposal: { proposalId: cachedPlan.planId ?? undefined, instruction, rawToolCalls: plan.rawToolCalls, communication: plan.communication, sourceRequestIds: [request.id] },
        approver: { kind: 'member', key: ANY_MEMBER_ACTOR_KEY },
      },
    });
  }

  return thread;
}

describe('POST /api/agent', () => {
  it('rejects a matching approval for an invalid cached plan', async () => {
    const approvedToolCalls = [{ id: 'send_1', name: 'send_reply', input: { text: 'Your refund is complete.' } }];
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: 'Reply', category: 'communication', enabled: true }],
      rawToolCalls: approvedToolCalls,
      validation: {
        status: 'invalid',
        issues: [{ code: 'ungrounded_customer_reply', message: 'The reply contains an unsupported claim.' }],
      },
    };
    const thread = await createThreadWithCachedPlan(plan);

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this', approvedToolCalls }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it('refuses a taskless historical plan until it is regenerated and reviewed', async () => {
    const approvedToolCalls = [{ id: 'refund_1', name: 'create_refund', input: { order_id: '456', amount: '20.00' } }];
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'refund_1', tool: 'create_refund', label: 'Issue refund', description: 'Refund $20.00', category: 'action', enabled: true }],
      rawToolCalls: approvedToolCalls,
      suspendedAtProposal: true,
    };
    const thread = await createThreadWithCachedPlan(plan, 'Handle this', false);

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this', approvedToolCalls }),
    }));

    expect(res.status).toBe(409);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it('rejects execution without approved tool calls', async () => {
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: '"Hi"', category: 'communication', enabled: true }],
      rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }],
    };
    const thread = await createThreadWithCachedPlan(plan);

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this' }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it('rejects approved tool calls that were not in the reviewed plan', async () => {
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: '"Hi"', category: 'communication', enabled: true }],
      rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }],
    };
    const thread = await createThreadWithCachedPlan(plan);

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: thread.id,
        instruction: 'Handle this',
        approvedToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Different text' } }],
      }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it('executes matching approved tool calls from the current reviewed plan', async () => {
    const approvedToolCalls = [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }];
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: '"Hi"', category: 'communication', enabled: true }],
      rawToolCalls: approvedToolCalls,
    };
    const thread = await createThreadWithCachedPlan(plan);

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this', approvedToolCalls }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: thread.id,
      instruction: 'Handle this',
      approvedToolCalls,
    }), expect.anything());
    await expect(res.json()).resolves.toMatchObject({
      execution: {
        id: expect.any(String),
        status: 'committed',
      },
    });

    const updatedThread = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.cachedPlan).toBeNull();
    expect(updatedThread?.cachedPlanMessageId).toBeNull();
  });

  it('clears the cached plan after failed execution', async () => {
    const approvedToolCalls = [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }];
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: '"Hi"', category: 'communication', enabled: true }],
      rawToolCalls: approvedToolCalls,
    };
    const thread = await createThreadWithCachedPlan(plan);
    mockExecuteAgentTurn.mockRejectedValueOnce(new Error('execution failed'));

    const res = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this', approvedToolCalls }),
    }));

    expect(res.status).toBe(500);
    expect(mockExecuteAgentTurn).toHaveBeenCalledTimes(1);

    const updatedThread = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.cachedPlan).toBeNull();
    expect(updatedThread?.cachedPlanMessageId).toBeNull();
  });

  it('rejects a second identical approval request after the plan is consumed', async () => {
    const approvedToolCalls = [{ id: 'send_1', name: 'send_reply', input: { text: 'Hi' } }];
    const plan: AgentPlan = {
      instruction: 'Handle this',
      steps: [{ id: 'send_1', tool: 'send_reply', label: 'Notify customer', description: '"Hi"', category: 'communication', enabled: true }],
      rawToolCalls: approvedToolCalls,
    };
    const thread = await createThreadWithCachedPlan(plan);
    const body = JSON.stringify({ threadId: thread.id, instruction: 'Handle this', approvedToolCalls });

    const first = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }));
    expect(first.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledTimes(1);

    const second = await POST(new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }));
    expect(second.status).toBe(400);
    expect(mockExecuteAgentTurn).toHaveBeenCalledTimes(1);
  });
});
