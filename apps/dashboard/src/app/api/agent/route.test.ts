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
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockExecuteAgentTurn.mockResolvedValue({ summary: 'Plan executed.', actionsPerformed: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

async function createThreadWithCachedPlan(plan: AgentPlan, instruction = 'Handle this') {
  const customer = await createTestCustomer(org.id, `customer-${crypto.randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const message = await createTestMessage(thread.id, 'Please help with my order');
  const settings = resolveAgentSettings(null);

  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: message.id,
      cachedPlan: buildAgentPlanCacheRecord({
        instruction,
        lastCustomerMessageId: message.id,
        settings,
        plan,
      }) as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
    },
  });

  return thread;
}

describe('POST /api/agent', () => {
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
