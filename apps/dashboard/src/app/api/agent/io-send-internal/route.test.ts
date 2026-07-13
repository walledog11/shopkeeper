import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findOwnedThread, sendEmail, sendReply } = vi.hoisted(() => ({
  findOwnedThread: vi.fn(),
  sendEmail: vi.fn(),
  sendReply: vi.fn(),
}));

vi.mock('@/lib/agent/tools/thread', () => ({ sendEmail, sendReply }));
vi.mock('@shopkeeper/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      thread: { findFirst: findOwnedThread },
    },
  };
});

import { POST } from './route';

function request(body: unknown, secret = 'internal-secret') {
  return new Request('http://localhost/api/agent/io-send-internal', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/io-send-internal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INTERNAL_API_SECRET', 'internal-secret');
    findOwnedThread.mockResolvedValue({ organization: { name: 'Acme' } });
    sendReply.mockResolvedValue({ status: 'ok', message: 'Reply sent' });
    sendEmail.mockResolvedValue({ status: 'ok', message: 'Email sent' });
  });

  it('rejects invalid internal authentication', async () => {
    const response = await POST(request({}, 'wrong'));

    expect(response.status).toBe(401);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it.each([
    ['send_reply', sendReply, { text: 'Hello' }],
    ['send_email', sendEmail, { to: 'buyer@example.com', subject: 'Hello', text: 'Body' }],
  ] as const)('dispatches %s through the matching provider tool', async (op, sender, input) => {
    const response = await POST(request({
      orgId: 'org-1',
      threadId: 'thread-1',
      orgName: 'Acme',
      op,
      input,
    }));

    expect(response.status).toBe(200);
    expect(sender).toHaveBeenCalledWith(input, {
      orgId: 'org-1',
      threadId: 'thread-1',
      orgName: 'Acme',
    });
  });

  it('validates operation and input before dispatch', async () => {
    const response = await POST(request({
      orgId: 'org-1',
      threadId: 'thread-1',
      op: 'delete_everything',
      input: {},
    }));

    expect(response.status).toBe(400);
    expect(sendReply).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a thread that is not owned by the supplied organization', async () => {
    findOwnedThread.mockResolvedValueOnce(null);

    const response = await POST(request({
      orgId: 'org-1',
      threadId: 'thread-from-another-org',
      orgName: 'Untrusted name',
      op: 'send_reply',
      input: { text: 'Hello' },
    }));

    expect(response.status).toBe(404);
    expect(findOwnedThread).toHaveBeenCalledWith({
      where: { id: 'thread-from-another-org', organizationId: 'org-1' },
      select: { organization: { select: { name: true } } },
    });
    expect(sendReply).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
