import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestIntegration,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  })),
}));

const { mockEnqueue } = vi.hoisted(() => ({ mockEnqueue: vi.fn() }));
vi.mock('@/lib/messaging/enqueue-outbound-email', () => ({
  enqueueOutboundEmail: mockEnqueue,
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const callRetry = (body: unknown) =>
  POST(new Request('http://localhost:3000/api/messages/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

async function seedFailedMessage(sendStatus: string | null = 'failed') {
  await createTestIntegration(org.id, {
    platform: ChannelType.email,
    externalAccountId: 'support@acme.com',
    fromEmail: 'support@acme.com',
  });
  const customer = await createTestCustomer(org.id, 'customer@example.com');
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const message = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.agent,
      contentText: 'Reply',
      sendStatus,
      sendError: sendStatus === 'failed' ? 'boom' : null,
    },
  });
  return { thread, message };
}

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockEnqueue.mockReset();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('POST /api/messages/retry', () => {
  it('re-enqueues a failed message and flips it back to pending', async () => {
    mockEnqueue.mockResolvedValue('enqueued');
    const { message } = await seedFailedMessage();

    const res = await callRetry({ messageId: message.id });
    expect(res.status).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledOnce();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('pending');
    expect(after?.sendError).toBeNull();
  });

  it('reverts to failed when the enqueue hop fails', async () => {
    mockEnqueue.mockResolvedValue('failed');
    const { message } = await seedFailedMessage();

    const res = await callRetry({ messageId: message.id });
    expect(res.status).toBe(502);

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toBe('Could not queue email send');
  });

  it('preserves an ambiguous enqueue hop as unknown', async () => {
    mockEnqueue.mockResolvedValue('unknown');
    const { message } = await seedFailedMessage();

    const res = await callRetry({ messageId: message.id });
    expect(res.status).toBe(502);

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('unknown');
    expect(after?.sendError).toBe('Email queue admission outcome unknown');
  });

  it('rejects a message that is not in a failed state', async () => {
    const { message } = await seedFailedMessage('sent');

    const res = await callRetry({ messageId: message.id });
    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('returns 404 for a message in another org', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'other@example.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);
      const message = await db.message.create({
        data: {
          threadId: thread.id,
          organizationId: otherOrg.id,
          senderType: SenderType.agent,
          contentText: 'Reply',
          sendStatus: 'failed',
        },
      });

      const res = await callRetry({ messageId: message.id });
      expect(res.status).toBe(404);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
