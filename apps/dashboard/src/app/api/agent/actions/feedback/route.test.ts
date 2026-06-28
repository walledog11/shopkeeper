import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null;

function request(turnId: string, feedback: 'good' | null = 'good') {
  return new Request('http://localhost/api/agent/actions/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turnId, feedback }),
  });
}

async function seedAction(organizationId: string, turnId: string) {
  return db.agentAction.create({
    data: {
      turnId,
      organizationId,
      tool: 'send_reply',
      category: 'communication',
      input: { text: 'Hello' },
      status: 'success',
      mode: 'human_approved',
      durationMs: 12,
    },
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = null;
  vi.mocked(auth).mockResolvedValue({
    userId: 'user-1',
    orgId: org.clerkOrgId,
  } as never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('POST /api/agent/actions/feedback', () => {
  it('updates every action in the scoped turn', async () => {
    const turnId = randomUUID();
    await seedAction(org.id, turnId);
    await db.agentAction.create({
      data: {
        turnId,
        organizationId: org.id,
        tool: 'update_thread_status',
        category: 'thread',
        input: { status: 'closed' },
        status: 'success',
        mode: 'human_approved',
        durationMs: 5,
      },
    });

    const response = await POST(request(turnId));

    expect(response.status).toBe(200);
    await expect(db.agentAction.count({
      where: { organizationId: org.id, turnId, feedback: 'good' },
    })).resolves.toBe(2);
  });

  it('does not expose or mutate another organization turn', async () => {
    otherOrg = await createTestOrg();
    const turnId = randomUUID();
    const action = await seedAction(otherOrg.id, turnId);

    const response = await POST(request(turnId));

    expect(response.status).toBe(404);
    await expect(db.agentAction.findUnique({ where: { id: action.id } })).resolves.toMatchObject({
      feedback: null,
    });
  });

  it('rejects malformed feedback without writing', async () => {
    const turnId = randomUUID();
    const action = await seedAction(org.id, turnId);
    const response = await POST(new Request('http://localhost/api/agent/actions/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ turnId, feedback: 'bad' }),
    }));

    expect(response.status).toBe(400);
    await expect(db.agentAction.findUnique({ where: { id: action.id } })).resolves.toMatchObject({
      feedback: null,
    });
  });
});
