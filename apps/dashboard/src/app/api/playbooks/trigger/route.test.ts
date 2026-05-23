import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';

const { mockRunPlaybooks } = vi.hoisted(() => ({
  mockRunPlaybooks: vi.fn(),
}));

vi.mock('@/app/api/threads/_lib/playbook-runner', () => ({
  runPlaybooks: mockRunPlaybooks,
}));

import { POST } from './route';

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
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  restoreEnv();
  vi.clearAllMocks();
});

describe('POST /api/playbooks/trigger', () => {
  it('rejects missing and wrong internal secrets before running playbooks', async () => {
    for (const secret of [undefined, 'wrong-secret']) {
      const res = await POST(triggerRequest({ organizationId: org!.id, threadId: 'thread_1', trigger: { type: 'new_ticket' } }, secret));

      expect(res.status).toBe(401);
      expect(mockRunPlaybooks).not.toHaveBeenCalled();
    }
  });

  it('accepts the previous internal secret during rotation', async () => {
    const thread = await createEmailThread(org!.id);

    const res = await POST(triggerRequest({
      organizationId: org!.id,
      threadId: thread.id,
      trigger: { type: 'new_ticket' },
    }, 'previous-secret'));

    expect(res.status).toBe(200);
    expect(mockRunPlaybooks).toHaveBeenCalledWith(org!.id, { type: 'new_ticket' }, thread.id);
  });

  it('returns 400 for missing JSON bodies without running playbooks', async () => {
    const res = await POST(new Request('http://localhost/api/playbooks/trigger', {
      method: 'POST',
      headers: { 'x-internal-secret': 'current-secret' },
    }));

    expect(res.status).toBe(400);
    expect(mockRunPlaybooks).not.toHaveBeenCalled();
  });

  it('returns 400 for missing required fields without running playbooks', async () => {
    const thread = await createEmailThread(org!.id);

    const res = await POST(triggerRequest({ organizationId: org!.id, threadId: thread.id, trigger: {} }, 'current-secret'));

    expect(res.status).toBe(400);
    expect(mockRunPlaybooks).not.toHaveBeenCalled();
  });

  it('returns 404 when the thread does not belong to the provided org', async () => {
    otherOrg = await createTestOrg();
    const foreignThread = await createEmailThread(otherOrg.id);

    const res = await POST(triggerRequest({
      organizationId: org!.id,
      threadId: foreignThread.id,
      trigger: { type: 'new_ticket' },
    }, 'current-secret'));

    expect(res.status).toBe(404);
    expect(mockRunPlaybooks).not.toHaveBeenCalled();
  });

  it('blocks playbook writes when billing is past due', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'past_due' },
    });
    const thread = await createEmailThread(org!.id);

    const res = await POST(triggerRequest({
      organizationId: org!.id,
      threadId: thread.id,
      trigger: { type: 'new_ticket' },
    }, 'current-secret'));

    expect(res.status).toBe(402);
    expect(mockRunPlaybooks).not.toHaveBeenCalled();
  });
});

async function createEmailThread(orgId: string) {
  const customer = await createTestCustomer(orgId, `playbook_trigger_${crypto.randomUUID()}@example.com`);
  return createTestThread(orgId, customer.id, ChannelType.email);
}

function triggerRequest(body: unknown, secret?: string) {
  return new Request('http://localhost/api/playbooks/trigger', {
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
