import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';

const { mockDispatchMessage } = vi.hoisted(() => ({
  mockDispatchMessage: vi.fn(),
}));

vi.mock('@/lib/messaging/dispatch-message', () => ({
  dispatchMessage: mockDispatchMessage,
}));

import { AGENT_SETTINGS_DEFAULTS } from '@clerk/agent/settings';
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

describe('POST /api/messages/auto-ack', () => {
  it('rejects missing and wrong internal secrets without dispatching', async () => {
    for (const secret of [undefined, 'wrong-secret']) {
      const res = await POST(autoAckRequest({ threadId: 'thread_1' }, secret));

      expect(res.status).toBe(401);
      expect(mockDispatchMessage).not.toHaveBeenCalled();
    }
  });

  it('accepts the previous internal secret during rotation', async () => {
    const thread = await createEmailThread();

    const res = await POST(autoAckRequest({ threadId: thread.id }, 'previous-secret'));

    expect(res.status).toBe(200);
    expect(mockDispatchMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: thread.id }),
      expect.objectContaining({ id: org!.id }),
      AGENT_SETTINGS_DEFAULTS.autoAckMessage,
    );
  });

  it('returns 400 for malformed JSON without dispatching', async () => {
    const res = await POST(autoAckRequest('{', 'current-secret'));

    expect(res.status).toBe(400);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
  });

  it('returns 400 and does not dispatch when threadId is missing', async () => {
    const res = await POST(autoAckRequest({}, 'current-secret'));

    expect(res.status).toBe(400);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
  });

  it('returns 404 without dispatching when the thread does not exist', async () => {
    const res = await POST(autoAckRequest({ threadId: crypto.randomUUID() }, 'current-secret'));

    expect(res.status).toBe(404);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
  });

  it('blocks writes for past-due billing before dispatch or persistence', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { stripeStatus: 'past_due' },
    });
    const thread = await createEmailThread();

    const res = await POST(autoAckRequest({ threadId: thread.id }, 'current-secret'));

    expect(res.status).toBe(402);
    expect(mockDispatchMessage).not.toHaveBeenCalled();
    await expect(db.message.count({ where: { threadId: thread.id } })).resolves.toBe(0);
  });

  it('skips dispatch when the resolved auto-ack message is empty', async () => {
    await db.organization.update({
      where: { id: org!.id },
      data: { settings: { autoAckMessage: '   ' } },
    });
    const thread = await createEmailThread();

    const res = await POST(autoAckRequest({ threadId: thread.id }, 'current-secret'));
    const body = await res.json() as { ok: boolean; skipped?: boolean };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, skipped: true });
    expect(mockDispatchMessage).not.toHaveBeenCalled();
    await expect(db.message.count({ where: { threadId: thread.id } })).resolves.toBe(0);
  });

  it('returns 502 and does not persist when dispatch fails', async () => {
    const thread = await createEmailThread();
    mockDispatchMessage.mockResolvedValueOnce({ ok: false, error: 'provider unavailable' });

    const res = await POST(autoAckRequest({ threadId: thread.id }, 'current-secret'));

    expect(res.status).toBe(502);
    await expect(db.message.count({ where: { threadId: thread.id, senderType: SenderType.agent } })).resolves.toBe(0);
  });
});

async function createEmailThread() {
  const customer = await createTestCustomer(org!.id, `auto_ack_${crypto.randomUUID()}@example.com`);
  return createTestThread(org!.id, customer.id, ChannelType.email);
}

function autoAckRequest(body: unknown, secret?: string) {
  return new Request('http://localhost/api/messages/auto-ack', {
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
