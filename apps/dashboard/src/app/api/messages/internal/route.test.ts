import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChannelType,
  SenderType,
  ThreadFilterFeedback,
  ThreadFilterStatus,
  db,
} from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockDispatchMessage } = vi.hoisted(() => ({
  mockDispatchMessage: vi.fn(),
}));

vi.mock('@/lib/messaging/dispatch-message', () => ({
  dispatchMessage: mockDispatchMessage,
}));

import { POST } from './route';

const originalEnv = {
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  INTERNAL_API_SECRET_PREV: process.env.INTERNAL_API_SECRET_PREV,
};

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  process.env.INTERNAL_API_SECRET = 'current-secret';
  process.env.INTERNAL_API_SECRET_PREV = 'previous-secret';
  mockDispatchMessage.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  restoreEnv();
  vi.clearAllMocks();
});

describe('POST /api/messages/internal', () => {
  it('rejects missing and wrong internal secrets without dispatching', async () => {
    for (const secret of [undefined, 'wrong-secret']) {
      const req = messageRequest({ threadId: 'thread_1', text: 'hello' }, secret);

      const res = await POST(req);

      expect(res.status).toBe(401);
      expect(mockDispatchMessage).not.toHaveBeenCalled();
    }
  });

  it('accepts the previous internal secret during rotation', async () => {
    const thread = await createEmailThread();

    const res = await POST(messageRequest({ threadId: thread.id, text: 'Rotated reply' }, 'previous-secret'));

    expect(res.status).toBe(200);
    expect(mockDispatchMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: thread.id }),
      expect.objectContaining({ id: org!.id }),
      'Rotated reply',
    );
  });

  it('returns 400 for malformed JSON without dispatching', async () => {
    const res = await POST(messageRequest('{', 'current-secret'));

    expect(res.status).toBe(400);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
  });

  it('returns 400 and does not dispatch when body validation fails', async () => {
    const thread = await createEmailThread();

    const res = await POST(messageRequest({ threadId: thread.id, text: '   ' }, 'current-secret'));

    expect(res.status).toBe(400);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
    await expect(db.message.count({ where: { threadId: thread.id } })).resolves.toBe(0);
  });

  it('returns 404 without dispatching when the thread does not exist', async () => {
    const res = await POST(messageRequest({ threadId: crypto.randomUUID(), text: 'Hello' }, 'current-secret'));

    expect(res.status).toBe(404);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
  });

  it('blocks writes for past-due billing before dispatch or persistence', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'past_due' },
    });
    const thread = await createEmailThread();

    const res = await POST(messageRequest({ threadId: thread.id, text: 'Do not send' }, 'current-secret'));

    expect(res.status).toBe(402);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
    await expect(db.message.count({ where: { threadId: thread.id } })).resolves.toBe(0);
  });

  it('returns 502 and leaves thread feedback untouched when dispatch fails', async () => {
    const thread = await createEmailThread();
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: ThreadFilterStatus.filtered,
        filterFeedback: ThreadFilterFeedback.none,
      },
    });
    mockDispatchMessage.mockResolvedValueOnce({ ok: false, error: 'provider unavailable' });

    const res = await POST(messageRequest({ threadId: thread.id, text: 'Will fail' }, 'current-secret'));

    expect(res.status).toBe(502);
    await expect(db.message.count({ where: { threadId: thread.id, senderType: SenderType.agent } })).resolves.toBe(0);
    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.filterStatus).toBe(ThreadFilterStatus.filtered);
    expect(updated.filterFeedback).toBe(ThreadFilterFeedback.none);
  });

  it('marks filtered threads as confirmed genuine only after successful dispatch', async () => {
    const thread = await createEmailThread();
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: ThreadFilterStatus.filtered,
        filterFeedback: ThreadFilterFeedback.none,
      },
    });

    const res = await POST(messageRequest({ threadId: thread.id, text: 'Legit request' }, 'current-secret'));

    expect(res.status).toBe(200);
    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.filterStatus).toBe(ThreadFilterStatus.genuine);
    expect(updated.filterFeedback).toBe(ThreadFilterFeedback.confirmed_genuine);
  });
});

async function createEmailThread() {
  const customer = await createTestCustomer(org!.id, `customer_${crypto.randomUUID()}@example.com`);
  return createTestThread(org!.id, customer.id, ChannelType.email);
}

function messageRequest(body: unknown, secret?: string) {
  return new Request('http://localhost/api/messages/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-internal-secret': secret } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function restoreEnv() {
  if (originalEnv.INTERNAL_API_SECRET === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalEnv.INTERNAL_API_SECRET;
  if (originalEnv.INTERNAL_API_SECRET_PREV === undefined) delete process.env.INTERNAL_API_SECRET_PREV;
  else process.env.INTERNAL_API_SECRET_PREV = originalEnv.INTERNAL_API_SECRET_PREV;
}
