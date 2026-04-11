import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock the agent runner so tests don't call Anthropic
const { mockPlanAgent, mockBuildContext } = vi.hoisted(() => ({
  mockBuildContext: vi.fn().mockResolvedValue({ messages: [] }),
  mockPlanAgent: vi.fn().mockResolvedValue({
    instruction: 'Resolve order issue',
    steps: [{ label: 'Send reply', description: 'Reply to customer', category: 'write', enabled: true }],
    rawToolCalls: [],
  }),
}));

vi.mock('@/lib/agent/runner', () => ({
  buildContext: mockBuildContext,
  planAgent: mockPlanAgent,
}));

vi.mock('@/lib/agent/settings', () => ({
  resolveAgentSettings: vi.fn().mockReturnValue({}),
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org.id);
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
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Missing');
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

    const cachedPlan = {
      instruction: 'Check shipping',
      steps: [{ label: 'Lookup order', description: 'Look up the order', category: 'read', enabled: true }],
      rawToolCalls: [],
    };

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: cachedPlan as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
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
        cachedPlan: { instruction: 'old', steps: [], rawToolCalls: [] } as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
      },
    });

    // New message arrives — cache is now stale
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
});
