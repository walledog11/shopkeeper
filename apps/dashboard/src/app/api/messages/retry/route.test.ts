import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
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
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('@/lib/messaging/enqueue-outbound-email', () => ({
  enqueueOutboundEmail: mockEnqueue,
}));
vi.mock('@shopkeeper/email', async (importActual) => {
  const actual = await importActual<typeof import('@shopkeeper/email')>();
  return { ...actual, getEmailSender: () => ({ send: mockSend }) };
});

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';
import { handleOutboundEmailJob } from '../../../../../../gateway/src/message-handlers/outbound/outbound-email.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const callRetry = (body: unknown) =>
  POST(new Request('http://localhost:3000/api/messages/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

async function seedFailedMessage(sendStatus: string | null = 'failed') {
  const integration = await createTestIntegration(org.id, {
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
  return { integration, thread, message };
}

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockEnqueue.mockReset();
  mockSend.mockReset();
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

  it('lets only one concurrent retry claim a failed message', async () => {
    mockEnqueue.mockResolvedValue('enqueued');
    const { message } = await seedFailedMessage();

    const responses = await Promise.all([
      callRetry({ messageId: message.id }),
      callRetry({ messageId: message.id }),
    ]);

    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    expect(responses.filter(response => response.status === 400 || response.status === 409)).toHaveLength(1);
    expect(mockEnqueue).toHaveBeenCalledOnce();
  });

  it('delivers a failed attributed reply without repeating its committed cancellation', async () => {
    mockSend.mockResolvedValueOnce({ providerMessageId: 'provider-retry-1' });
    const { integration, thread, message } = await seedFailedMessage();
    const task = await db.agentTask.create({
      data: {
        organizationId: org.id,
        threadId: thread.id,
        initiatingActorKind: 'member',
        initiatingActorKey: 'member:test',
        objective: 'Cancel order #1001 and tell the customer.',
        runtimeVersion: 2,
        status: 'failed',
        checkpointVersion: 1,
        checkpoint: {},
        modelCallLimit: 10,
        activeTimeMsLimit: 60_000,
        spendNanoUsdLimit: BigInt(1_000_000_000),
        failureCode: 'reply_delivery_failed',
      },
    });
    await db.agentAction.create({
      data: {
        turnId: randomUUID(),
        organizationId: org.id,
        threadId: thread.id,
        taskId: task.id,
        tool: 'cancel_order',
        category: 'action',
        input: { order_id: '9000001001' },
        output: 'Order #1001 canceled.',
        status: 'success',
        mode: 'human_approved',
      },
    });
    await db.message.update({
      where: { id: message.id },
      data: { agentTaskId: task.id },
    });
    mockEnqueue.mockImplementationOnce(async (data) => {
      await handleOutboundEmailJob({
        data,
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as Parameters<typeof handleOutboundEmailJob>[0]);
      return 'enqueued';
    });

    const res = await callRetry({ messageId: message.id });

    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      messageId: message.id,
      integrationId: integration.id,
      source: 'agent_send_reply',
    }));
    expect(await db.message.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
      agentTaskId: task.id,
      sendStatus: 'sent',
      providerMessageId: 'provider-retry-1',
    });
    expect(await db.agentAction.count({
      where: { organizationId: org.id, taskId: task.id, tool: 'cancel_order' },
    })).toBe(1);
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
