import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { sendEmail, sendReply } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendReply: vi.fn(),
}));

vi.mock('@/lib/agent/thread-io/send', () => ({ sendEmail, sendReply }));

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

let organizationId: string | undefined;

describe('POST /api/agent/io-send-internal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INTERNAL_API_SECRET', 'internal-secret');
    sendReply.mockResolvedValue({ status: 'ok', message: 'Reply sent' });
  });

  afterEach(async () => {
    await cleanupTestData(organizationId);
    organizationId = undefined;
  });

  it('rejects invalid internal authentication', async () => {
    const response = await POST(request({}, 'wrong'));

    expect(response.status).toBe(401);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it('forwards the durable operation identity as an inseparable pair', async () => {
    const organization = await createTestOrg();
    organizationId = organization.id;
    const customer = await createTestCustomer(organization.id, `pair:${organization.id}`);
    const thread = await createTestThread(organization.id, customer.id, ChannelType.email);

    const response = await POST(request({
      orgId: organization.id,
      threadId: thread.id,
      op: 'send_reply',
      input: { text: 'Hello' },
      operationId: 'operation-1',
      executionId: 'execution-1',
    }));

    expect(response.status).toBe(200);
    expect(sendReply).toHaveBeenCalledWith({ text: 'Hello' }, expect.objectContaining({
      operationId: 'operation-1',
      executionId: 'execution-1',
    }));

    const invalid = await POST(request({
      orgId: organization.id,
      threadId: thread.id,
      op: 'send_reply',
      input: { text: 'Hello' },
      operationId: 'operation-1',
    }));
    expect(invalid.status).toBe(400);
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
});
