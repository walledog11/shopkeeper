import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { CHANNEL } from '../constants.js';
import { registerInternalStorefrontChatRoutes } from './internal-storefront-chat.js';
import internalStorefrontChatRouter from './internal-storefront-chat.js';
import { processInboundMessage } from '../message-handlers/inbound-persistence.js';

const queueAddSpy = vi.fn().mockResolvedValue({ id: 'test-ai-summary-job' });

vi.mock('../message-handlers/inbound-persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../message-handlers/inbound-persistence.js')>();
  return {
    ...actual,
    processInboundMessage: vi.fn(actual.processInboundMessage),
  };
});

vi.mock('../clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({
    add: (...args: unknown[]) => queueAddSpy(...args),
  }),
}));

vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    getInternalApiSecret: () => 'test-internal-secret',
  };
});

function createApp() {
  const app = express();
  const router = express.Router();
  registerInternalStorefrontChatRoutes(router);
  app.use('/internal', router);
  return app;
}

const app = createApp();
const SECRET = 'test-internal-secret';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let integration: Awaited<ReturnType<typeof createTestIntegration>>;
let session: { id: string };

async function createSession(overrides: {
  threadId?: string | null;
  customerId?: string | null;
  revokedAt?: Date | null;
} = {}) {
  return db.storefrontChatSession.create({
    data: {
      organizationId: org.id,
      integrationId: integration.id,
      storefrontHost: integration.externalAccountId,
      resumeSecretHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ...(overrides.threadId !== undefined ? { threadId: overrides.threadId } : {}),
      ...(overrides.customerId !== undefined ? { customerId: overrides.customerId } : {}),
      ...(overrides.revokedAt !== undefined ? { revokedAt: overrides.revokedAt } : {}),
    },
  });
}

function postMessage(body: Record<string, unknown>) {
  return request(app)
    .post('/internal/storefront-chat/message')
    .set('x-internal-secret', SECRET)
    .send(body);
}

beforeEach(async () => {
  queueAddSpy.mockClear();
  vi.mocked(processInboundMessage).mockClear();
  org = await createTestOrg();
  integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: `store-${org.id.slice(0, 8)}.myshopify.com`,
    metadata: { storefrontChat: { enabled: true } },
  });
  session = await createSession();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('POST /internal/storefront-chat/message', () => {
  it('returns 401 without x-internal-secret', async () => {
    const response = await request(app)
      .post('/internal/storefront-chat/message')
      .send({ organizationId: org.id, sessionId: session.id, text: 'hello' });

    expect(response.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await postMessage({ organizationId: org.id, sessionId: session.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'organizationId, sessionId and text are required' });
  });

  it('returns 400 for blank text', async () => {
    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: '   ',
    });

    expect(response.status).toBe(400);
  });

  it('exports a default router', () => {
    expect(internalStorefrontChatRouter).toBeDefined();
  });

  it('returns 404 when the session does not exist', async () => {
    const response = await postMessage({
      organizationId: org.id,
      sessionId: '00000000-0000-4000-8000-000000000099',
      text: 'hello',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'session not found' });
  });

  it('returns 404 for a revoked session', async () => {
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: 'hello',
    });

    expect(response.status).toBe(404);
  });

  it('accepts a message without optional ids', async () => {
    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: 'No optional ids',
    });

    expect(response.status).toBe(202);
    expect(response.body.threadId).toEqual(expect.any(String));
  });

  it('persists a shopper message and binds the session to the created thread', async () => {
    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      integrationId: integration.id,
      text: 'Where is my order?',
      clientMessageId: 'widget-msg-1',
    });

    expect(response.status).toBe(202);
    expect(response.body.isNewThread).toBe(true);
    expect(response.body.threadId).toEqual(expect.any(String));

    const bound = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(bound.threadId).toBe(response.body.threadId);
    expect(bound.customerId).toEqual(expect.any(String));
    expect(bound.lastSeenAt).toBeInstanceOf(Date);

    const message = await db.message.findFirst({
      where: {
        organizationId: org.id,
        externalMessageId: `${CHANNEL.SHOPIFY_CHAT}:${session.id}:widget-msg-1`,
      },
    });
    expect(message?.contentText).toBe('Where is my order?');
    expect(queueAddSpy).toHaveBeenCalled();
  });

  it('dedupes a retry with the same clientMessageId', async () => {
    const body = {
      organizationId: org.id,
      sessionId: session.id,
      integrationId: integration.id,
      text: 'hello again',
      clientMessageId: 'widget-msg-dup',
    };

    const first = await postMessage(body);
    expect(first.status).toBe(202);

    queueAddSpy.mockClear();
    const second = await postMessage(body);

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ deduped: true });
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('re-binds the session when a closed thread rollover opens a new one', async () => {
    const customer = await createTestCustomer(org.id, `${CHANNEL.SHOPIFY_CHAT}:${session.id}`);
    const oldThread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { threadId: oldThread.id, customerId: customer.id },
    });
    await db.thread.update({
      where: { id: oldThread.id },
      data: { status: 'closed' },
    });

    const newThread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    vi.mocked(processInboundMessage).mockResolvedValueOnce({ thread: newThread, isNew: true });

    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: 'Follow-up after close',
    });

    expect(response.status).toBe(202);
    expect(response.body.threadId).toBe(newThread.id);

    const bound = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(bound.threadId).toBe(newThread.id);
  });

  it('skips session re-bind when the thread is already linked', async () => {
    const customer = await createTestCustomer(org.id, `${CHANNEL.SHOPIFY_CHAT}:${session.id}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { threadId: thread.id, customerId: customer.id },
    });
    const before = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });

    vi.mocked(processInboundMessage).mockResolvedValueOnce({ thread, isNew: false });

    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: 'Another question',
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ threadId: thread.id, isNewThread: false });

    const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.lastSeenAt.getTime()).toBe(before.lastSeenAt.getTime());
  });

  it('returns 500 when persistence fails', async () => {
    vi.mocked(processInboundMessage).mockRejectedValueOnce(new Error('db unavailable'));

    const response = await postMessage({
      organizationId: org.id,
      sessionId: session.id,
      text: 'hello',
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'failed to persist message' });
  });
});
