import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@/lib/agent/api/plan-cache';
import type { AgentPlan } from '@/types';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock the agent runner so tests don't call Anthropic
const { mockPlanAgent, mockBuildContext } = vi.hoisted(() => ({
  mockBuildContext: vi.fn().mockResolvedValue({ messages: [] }),
  mockPlanAgent: vi.fn().mockResolvedValue({
    instruction: 'Resolve order issue',
    steps: [{ id: 'step_1', tool: 'send_reply', label: 'Send reply', description: 'Reply to customer', category: 'communication', enabled: true }],
    rawToolCalls: [],
  }),
}));

vi.mock('@/lib/agent/runner', () => ({
  buildContext: mockBuildContext,
  hashInstructionForLog: vi.fn(() => 'test-hash'),
  planAgent: mockPlanAgent,
}));

vi.mock('@shopkeeper/agent/settings', () => ({
  resolveAgentSettings: vi.fn().mockReturnValue({}),
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('POST /api/agent/plan', () => {
  it('returns 400 when threadId or instruction is missing', async () => {
    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'some-id' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; details?: Array<{ field?: string; code: string; message: string }> };
    expect(body.error).toBe('Validation failed');
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'instruction',
          code: 'required',
          message: 'Instruction is required',
        }),
      ])
    );
  });

  it('returns empty steps when there are no customer messages', async () => {
    const customer = await createTestCustomer(org.id, 'no_msgs@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle this' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { steps: unknown[] };
    expect(body.steps).toHaveLength(0);
    expect(mockPlanAgent).not.toHaveBeenCalled();
  });

  it('calls planAgent and caches result on cache miss', async () => {
    const customer = await createTestCustomer(org.id, 'has_msgs@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'I need help with order #1234');

    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Resolve order issue' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { steps: unknown[] };
    expect(body.steps).toHaveLength(1);
    expect(mockPlanAgent).toHaveBeenCalledOnce();

    // Verify plan was persisted in DB
    const updatedThread = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.cachedPlan).not.toBeNull();
    expect(updatedThread?.cachedPlanMessageId).not.toBeNull();
  });

  it('returns cached plan on cache hit without calling planAgent', async () => {
    const customer = await createTestCustomer(org.id, 'cached@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Problem with my shipment');

    const cachedPlan: AgentPlan = {
      instruction: 'Check shipping',
      steps: [{ id: 'step_1', tool: 'lookup_order', label: 'Lookup order', description: 'Look up the order', category: 'read', enabled: true }],
      rawToolCalls: [],
    };

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: 'Check shipping',
          lastCustomerMessageId: message.id,
          settings: {},
          plan: cachedPlan,
        }) as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
      },
    });

    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Check shipping' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { steps: unknown[] };
    expect(body.steps).toHaveLength(1);
    expect(mockPlanAgent).not.toHaveBeenCalled();
  });

  it('generates a new plan when a new customer message arrives after a cached plan', async () => {
    const customer = await createTestCustomer(org.id, 'stale_cache@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const oldMessage = await createTestMessage(thread.id, 'Old message');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: oldMessage.id,
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: 'old',
          lastCustomerMessageId: oldMessage.id,
          settings: {},
          plan: { instruction: 'old', steps: [], rawToolCalls: [] },
        }) as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
      },
    });

    // New message arrives , cache is now stale
    await createTestMessage(thread.id, 'New message with new issue');

    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'Handle new issue' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPlanAgent).toHaveBeenCalledOnce();
  });

  it('does not return another orgs cached plan', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'cross-org@test.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);
      const message = await createTestMessage(thread.id, 'Cross org message');

      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlanMessageId: message.id,
          cachedPlan: buildAgentPlanCacheRecord({
            instruction: 'Cross org message',
            lastCustomerMessageId: message.id,
            settings: {},
            plan: { instruction: 'Cross org message', steps: [], rawToolCalls: [] },
          }) as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
        },
      });

      const req = new Request('http://localhost:3000/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, instruction: 'Cross org message' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      expect(mockPlanAgent).not.toHaveBeenCalled();
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('invalidates the cache when the instruction changes', async () => {
    const customer = await createTestCustomer(org.id, 'cache-miss@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Problem with billing');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: buildAgentPlanCacheRecord({
          instruction: 'Old instruction',
          lastCustomerMessageId: message.id,
          settings: {},
          plan: {
            instruction: 'Old instruction',
            steps: [{ id: 'step_1', tool: 'lookup_order', label: 'Old', description: 'Old', category: 'read', enabled: true }],
            rawToolCalls: [],
          },
        }) as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
      },
    });

    const req = new Request('http://localhost:3000/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, instruction: 'New instruction' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockPlanAgent).toHaveBeenCalledOnce();
  });
});
