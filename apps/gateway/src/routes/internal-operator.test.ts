import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@clerk/db/test-helpers';

const { sendMessageSpy } = vi.hoisted(() => ({
  sendMessageSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
  setWebhook: vi.fn(),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

import { registerInternalOperatorRoutes } from './internal-operator.js';

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerInternalOperatorRoutes(router);
  app.use('/internal', router);
  return app;
}

const SECRET = 'test-internal-secret-abc123';
const app = createApp();
let org!: Awaited<ReturnType<typeof createTestOrg>>;
const originalSecret = process.env.INTERNAL_API_SECRET;
const originalDashboardUrl = process.env.DASHBOARD_URL;

beforeEach(async () => {
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.DASHBOARD_URL = 'http://dashboard.test';
  sendMessageSpy.mockClear();
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = originalSecret;
  if (originalDashboardUrl === undefined) delete process.env.DASHBOARD_URL;
  else process.env.DASHBOARD_URL = originalDashboardUrl;
});

describe('POST /internal/operator/escalate', () => {
  it('returns 401 when x-internal-secret is missing', async () => {
    const customer = await createTestCustomer(org.id, 'no-auth@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .send({ organizationId: org.id, threadId: thread.id, reason: 'why' });

    expect(res.status).toBe(401);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when x-internal-secret is wrong', async () => {
    const customer = await createTestCustomer(org.id, 'bad-auth@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', 'wrong-secret')
      .send({ organizationId: org.id, threadId: thread.id, reason: 'why' });

    expect(res.status).toBe(401);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns notified: 0 when no bound operators exist', async () => {
    const customer = await createTestCustomer(org.id, 'no-members@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({ organizationId: org.id, threadId: thread.id, reason: 'wholesale' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 0 });
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the thread does not exist', async () => {
    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: '00000000-0000-0000-0000-000000000000',
        reason: 'nope',
      });

    expect(res.status).toBe(404);
  });

  it('pushes the escalation to every bound operator', async () => {
    const customer = await createTestCustomer(org.id, 'two-members@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `user-${org.id}-1`,
        telegramChatId: `chat-${org.id}-1`,
      },
    });
    await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `user-${org.id}-2`,
        telegramChatId: `chat-${org.id}-2`,
      },
    });

    const res = await request(app)
      .post('/internal/operator/escalate')
      .set('x-internal-secret', SECRET)
      .send({
        organizationId: org.id,
        threadId: thread.id,
        reason: 'Wholesale pricing question.',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notified: 2 });
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);

    const bodyArg = sendMessageSpy.mock.calls[0][1] as string;
    expect(bodyArg).toContain('Escalated');
    expect(bodyArg).toContain('Wholesale pricing question.');
    expect(bodyArg).toContain(`/dashboard/tickets/${thread.id}`);
  });
});
