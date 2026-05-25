import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';
import type { AgentPlan } from '@/types';

const { mockBuildContext, mockExecuteAgentTurn, mockPlanAgent } = vi.hoisted(() => ({
  mockBuildContext: vi.fn(),
  mockExecuteAgentTurn: vi.fn(),
  mockPlanAgent: vi.fn(),
}));

vi.mock('@/lib/agent/runner', () => ({
  buildContext: mockBuildContext,
  planAgent: mockPlanAgent,
}));

vi.mock('@/lib/agent/api/execution', () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

import { POST } from './route';

const TEST_PLAN: AgentPlan = {
  instruction: 'Handle this request',
  steps: [
    {
      id: 'tool_1',
      tool: 'lookup_order',
      label: 'Lookup order',
      description: 'Find the order before replying',
      category: 'read',
      enabled: true,
    },
  ],
  rawToolCalls: [],
};

const originalEnv = {
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  INTERNAL_API_SECRET_PREV: process.env.INTERNAL_API_SECRET_PREV,
};

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  process.env.INTERNAL_API_SECRET = 'current-secret';
  process.env.INTERNAL_API_SECRET_PREV = 'previous-secret';
  mockBuildContext.mockResolvedValue({ threadId: 'thread_ctx' });
  mockPlanAgent.mockResolvedValue(TEST_PLAN);
  mockExecuteAgentTurn.mockResolvedValue({ summary: 'Done', actionsPerformed: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  restoreEnv();
  vi.clearAllMocks();
});

describe('POST /api/agent/plan-internal', () => {
  it('rejects missing and wrong internal secrets before planning', async () => {
    for (const secret of [undefined, 'wrong-secret']) {
      const res = await POST(planRequest({ orgId: org!.id, threadId: crypto.randomUUID() }, secret));

      expect(res.status).toBe(401);
      expect(mockPlanAgent).not.toHaveBeenCalled();
    }
  });

  it('accepts the previous internal secret and caches the generated plan', async () => {
    const thread = await createThreadWithCustomerMessage(org!.id);

    const res = await POST(planRequest({ orgId: org!.id, threadId: thread.id }, 'previous-secret'));
    const body = await res.json() as { plan: AgentPlan; instruction: string };

    expect(res.status).toBe(200);
    expect(body.plan).toEqual(TEST_PLAN);
    expect(mockBuildContext).toHaveBeenCalledWith(thread.id, org!.id);
    expect(mockPlanAgent).toHaveBeenCalledOnce();

    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.cachedPlan).not.toBeNull();
    expect(updated.cachedPlanMessageId).not.toBeNull();
  });

  it('returns 400 for a missing JSON body without planning or caching', async () => {
    const thread = await createThreadWithCustomerMessage(org!.id);

    const res = await POST(new Request('http://localhost/api/agent/plan-internal', {
      method: 'POST',
      headers: { 'x-internal-secret': 'current-secret' },
    }));

    expect(res.status).toBe(400);
    expect(mockPlanAgent).not.toHaveBeenCalled();
    const unchanged = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(unchanged.cachedPlan).toBeNull();
  });

  it('returns 404 when threadId does not belong to orgId and leaves the foreign thread untouched', async () => {
    otherOrg = await createTestOrg();
    const foreignThread = await createThreadWithCustomerMessage(otherOrg.id);

    const res = await POST(planRequest({ orgId: org!.id, threadId: foreignThread.id }, 'current-secret'));

    expect(res.status).toBe(404);
    expect(mockPlanAgent).not.toHaveBeenCalled();
    const unchanged = await db.thread.findUniqueOrThrow({ where: { id: foreignThread.id } });
    expect(unchanged.cachedPlan).toBeNull();
  });

  it('does not cache a plan when planning fails', async () => {
    const thread = await createThreadWithCustomerMessage(org!.id);
    mockPlanAgent.mockRejectedValueOnce(new Error('planner failed'));

    const res = await POST(planRequest({ orgId: org!.id, threadId: thread.id }, 'current-secret'));

    expect(res.status).toBe(500);
    const unchanged = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(unchanged.cachedPlan).toBeNull();
    expect(unchanged.cachedPlanMessageId).toBeNull();
  });

  it('auto-executes a trusted cached plan when explicitly allowed and enabled for the org', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: {
        settings: {
          autonomyTier: 'trusted',
          autoExecuteEnabled: true,
          maxRefundAmount: 100,
        },
      },
    });
    const thread = await createThreadWithCustomerMessage(org!.id);
    const refundPlan: AgentPlan = {
      instruction: 'Handle this request',
      steps: [
        {
          id: 'refund_1',
          tool: 'create_refund',
          label: 'Issue refund',
          description: 'Refund $20',
          category: 'action',
          enabled: true,
        },
        {
          id: 'send_1',
          tool: 'send_reply',
          label: 'Notify customer',
          description: 'Let the customer know',
          category: 'communication',
          enabled: true,
        },
      ],
      rawToolCalls: [
        { id: 'read_1', name: 'get_order_by_name', input: { order_name: '#1001' } },
        { id: 'refund_1', name: 'create_refund', input: { order_id: 'gid://shopify/Order/1', amount: '20.00' } },
        { id: 'send_1', name: 'send_reply', input: { text: 'I issued the refund.' } },
      ],
    };
    mockPlanAgent.mockResolvedValueOnce(refundPlan);
    mockExecuteAgentTurn.mockResolvedValueOnce({
      summary: 'Refund issued and customer notified.',
      actionsPerformed: [
        { tool: 'create_refund', result: 'Refund of $20.00 issued successfully.' },
        { tool: 'send_reply', result: 'Reply sent to customer via email.' },
      ],
    });

    const res = await POST(planRequest({
      orgId: org!.id,
      threadId: thread.id,
      allowAutoExecute: true,
    }, 'current-secret'));
    const body = await res.json() as {
      plan: AgentPlan;
      autoExecuted?: boolean;
      autoExecutionStatus?: string;
      autoExecutionSummary?: string;
    };

    expect(res.status).toBe(200);
    expect(body.plan).toEqual(refundPlan);
    expect(body.autoExecuted).toBe(true);
    expect(body.autoExecutionStatus).toBe('success');
    expect(body.autoExecutionSummary).toBe('Refund issued and customer notified.');
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      orgId: org!.id,
      threadId: thread.id,
      approvedToolCalls: [
        { id: 'refund_1', name: 'create_refund', input: { order_id: 'gid://shopify/Order/1', amount: '20.00' } },
        { id: 'send_1', name: 'send_reply', input: { text: 'I issued the refund.' } },
      ],
      auditMode: 'auto_executed',
    }));

    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.cachedPlan).toBeNull();
    expect(updated.cachedPlanMessageId).toBeNull();
  });

  it('does not auto-execute when the internal caller does not opt in', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: {
        settings: {
          autonomyTier: 'trusted',
          autoExecuteEnabled: true,
          maxRefundAmount: 100,
        },
      },
    });
    const thread = await createThreadWithCustomerMessage(org!.id);
    mockPlanAgent.mockResolvedValueOnce({
      instruction: 'Handle this request',
      steps: [{
        id: 'refund_1',
        tool: 'create_refund',
        label: 'Issue refund',
        description: 'Refund $20',
        category: 'action',
        enabled: true,
      }],
      rawToolCalls: [
        { id: 'refund_1', name: 'create_refund', input: { order_id: 'gid://shopify/Order/1', amount: '20.00' } },
      ],
    });

    const res = await POST(planRequest({ orgId: org!.id, threadId: thread.id }, 'current-secret'));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.cachedPlan).not.toBeNull();
    expect(updated.cachedPlanMessageId).not.toBeNull();
  });
});

async function createThreadWithCustomerMessage(orgId: string) {
  const customer = await createTestCustomer(orgId, `plan_${crypto.randomUUID()}@example.com`);
  const thread = await createTestThread(orgId, customer.id, ChannelType.email);
  await createTestMessage(thread.id, 'I need help with order 1001');
  return thread;
}

function planRequest(body: unknown, secret?: string) {
  return new Request('http://localhost/api/agent/plan-internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-internal-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

function restoreEnv() {
  if (originalEnv.INTERNAL_API_SECRET === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalEnv.INTERNAL_API_SECRET;
  if (originalEnv.INTERNAL_API_SECRET_PREV === undefined) delete process.env.INTERNAL_API_SECRET_PREV;
  else process.env.INTERNAL_API_SECRET_PREV = originalEnv.INTERNAL_API_SECRET_PREV;
}
