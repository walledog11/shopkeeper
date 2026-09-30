import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestOrg, createTestCustomer, createTestThread, createTestMessage, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
const { submit, list } = vi.hoisted(() => ({ submit: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/agent/api/gateway-operator-turn', () => ({ postGatewayPlanRequest: submit, listGatewayAgentRequests: list }));
import { DELETE, GET, POST } from './route';
import { auth } from '@clerk/nextjs/server';
let org!: Awaited<ReturnType<typeof createTestOrg>>;
beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  submit.mockResolvedValue({ status: 202, payload: { requestId: randomUUID(), taskId: randomUUID(), status: 'queued' } });
  list.mockResolvedValue({ status: 200, payload: { requests: [] } });
});
afterEach(async () => { await cleanupTestData(org?.id); vi.clearAllMocks(); });
function request(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/agent/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
describe('POST /api/agent/plan', () => {
  it('requires a stable client request ID and instruction', async () => {
    const result = await POST(request({ threadId: randomUUID() }));
    expect(result.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });
  it('accepts durable planning and passes the authenticated member and regeneration intent', async () => {
    const customer = await createTestCustomer(org.id, 'composer@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const clientRequestId = randomUUID();
    const result = await POST(request({ threadId: thread.id, clientRequestId, instruction: 'Revise the reply', force: true }));
    expect(result.status).toBe(202);
    expect(submit).toHaveBeenCalledWith({ organizationId: org.id, clerkUserId: 'usr_test', threadId: thread.id, clientRequestId, instruction: 'Revise the reply', force: true });
    expect(await result.json()).toMatchObject({ status: 'queued', requestId: expect.any(String) });
    expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan).toBeNull();
  });
  it('preserves a gateway conflict instead of reporting a generated plan', async () => {
    const customer = await createTestCustomer(org.id, 'composer@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    submit.mockResolvedValue({ status: 409, payload: { error: 'Work is already underway' } });
    const result = await POST(request({ threadId: thread.id, clientRequestId: randomUUID(), instruction: 'Revise' }));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({ error: 'Work is already underway' });
  });
  it('refuses another organization’s ticket before submitting work', async () => {
    const other = await createTestOrg();
    try {
      const customer = await createTestCustomer(other.id, 'other@test.com');
      const thread = await createTestThread(other.id, customer.id, ChannelType.email);
      expect((await POST(request({ threadId: thread.id, clientRequestId: randomUUID(), instruction: 'Reply' }))).status).toBe(404);
      expect(submit).not.toHaveBeenCalled();
    } finally { await cleanupTestData(other.id); }
  });
  it('restores planning history on the scoped ticket', async () => {
    const customer = await createTestCustomer(org.id, 'composer@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const result = await GET(new Request(`http://localhost:3000/api/agent/plan?threadId=${thread.id}`));
    expect(result.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ organizationId: org.id, clerkUserId: 'usr_test', threadId: thread.id });
  });
});

describe('DELETE /api/agent/plan', () => {
  it('dismisses only the reviewed cached plan', async () => {
    const customer = await createTestCustomer(org.id, 'dismiss@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, 'Please help');
    const cache = buildAgentPlanCacheRecord({
      instruction: 'Reply',
      lastCustomerMessageId: message.id,
      settings: {},
      plan: {
        instruction: 'Reply',
        steps: [{ id: 'send_1', tool: 'send_reply', label: 'Reply', description: 'Reply', category: 'communication', enabled: true }],
        rawToolCalls: [{ id: 'send_1', name: 'send_reply', input: { text: 'Hello' } }],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: cache as unknown as Parameters<typeof db.thread.update>[0]['data']['cachedPlan'],
      },
    });

    const stale = await DELETE(new Request('http://localhost:3000/api/agent/plan', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, planId: 'stale-plan' }),
    }));
    // A stale card is the merchant's problem to see, not an error to raise: the
    // request succeeds as a no-op and the current plan survives untouched.
    expect(stale.status).toBe(200);
    expect(await stale.json()).toEqual({ ok: true, dismissed: false });
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();

    const dismissed = await DELETE(new Request('http://localhost:3000/api/agent/plan', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, planId: cache.planId }),
    }));
    expect(dismissed.status).toBe(200);
    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.cachedPlan).toBeNull();
    expect(updated?.cachedPlanMessageId).toBeNull();
  });
});
