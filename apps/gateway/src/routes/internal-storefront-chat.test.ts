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

// Stubbed at the module edge rather than at the operator transport, so the test
// asserts how often the merchant is told and not how Telegram is called.
const exhaustionAlertSpy = vi.fn().mockResolvedValue(1);

vi.mock('../storefront-chat-exhaustion-alert.js', () => ({
  alertStorefrontChatExhaustion: (...args: unknown[]) => exhaustionAlertSpy(...args),
}));

// In-memory stand-in for the burst counter. Redis is not available in the test
// run and the limiter fails open without it, which would leave the burst layer
// asserted by nothing.
const burstCounters = new Map<string, number>();

vi.mock('../clients/redis-client.js', () => ({
  getGatewayRedis: () => ({
    incr: (key: string) => {
      const next = (burstCounters.get(key) ?? 0) + 1;
      burstCounters.set(key, next);
      return Promise.resolve(next);
    },
    expire: () => Promise.resolve(1),
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
  burstCounters.clear();
  queueAddSpy.mockClear();
  exhaustionAlertSpy.mockClear();
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
  vi.unstubAllEnvs();
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

  describe('storefront budget', () => {
    it('refuses the message past the per-session budget, before any model work', async () => {
      vi.stubEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SESSION', '2');

      for (let i = 0; i < 2; i++) {
        const allowed = await postMessage({
          organizationId: org.id,
          sessionId: session.id,
          text: `question ${i}`,
          clientMessageId: `budget-${i}`,
        });
        expect(allowed.status).toBe(202);
      }

      vi.mocked(processInboundMessage).mockClear();
      queueAddSpy.mockClear();

      const refused = await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'one too many',
        clientMessageId: 'budget-over',
      });

      expect(refused.status).toBe(429);
      expect(refused.body.denial).toBe('session_budget');
      expect(refused.body.shopperMessage).toEqual(expect.any(String));
      // The whole point of gating here: nothing downstream ran, so the refusal
      // cost the merchant nothing.
      expect(processInboundMessage).not.toHaveBeenCalled();
      expect(queueAddSpy).not.toHaveBeenCalled();
    });

    it('refuses past the per-shop daily budget and leaves the org LLM cap untouched', async () => {
      vi.stubEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY', '1');

      const first = await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'first of the day',
        clientMessageId: 'shop-1',
      });
      expect(first.status).toBe(202);

      // A different browser on the same shop: the per-session budget is fresh,
      // the shop's daily one is not.
      const other = await createSession();
      const refused = await postMessage({
        organizationId: org.id,
        sessionId: other.id,
        text: 'second of the day',
        clientMessageId: 'shop-2',
      });

      expect(refused.status).toBe(429);
      expect(refused.body.denial).toBe('shop_budget');

      // Isolation is the property that matters: exhausting the storefront must
      // not consume the cap the merchant's email and Instagram agents share.
      const orgSpend = await db.llmDailySpend.findMany({ where: { organizationId: org.id } });
      expect(orgSpend).toEqual([]);
    });

    it('tells the merchant once when the ceiling is crossed, not once per refusal', async () => {
      vi.stubEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY', '1');

      await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'the one admitted message',
        clientMessageId: 'alert-1',
      });
      expect(exhaustionAlertSpy).not.toHaveBeenCalled();

      const crossing = await postMessage({
        organizationId: org.id,
        sessionId: (await createSession()).id,
        text: 'the one that closes the widget',
        clientMessageId: 'alert-2',
      });
      expect(crossing.status).toBe(429);
      expect(exhaustionAlertSpy).toHaveBeenCalledTimes(1);
      expect(exhaustionAlertSpy.mock.calls[0][0]).toMatchObject({
        organizationId: org.id,
        integrationId: integration.id,
        limit: 1,
      });

      // A shop under sustained load would otherwise turn one closed widget into
      // hundreds of notifications.
      for (const [index, id] of ['alert-3', 'alert-4', 'alert-5'].entries()) {
        const again = await postMessage({
          organizationId: org.id,
          sessionId: (await createSession()).id,
          text: `refusal ${index}`,
          clientMessageId: id,
        });
        expect(again.status).toBe(429);
      }
      expect(exhaustionAlertSpy).toHaveBeenCalledTimes(1);
    });

    it('counts only admitted messages against the session budget', async () => {
      vi.stubEnv('STOREFRONT_CHAT_MAX_MESSAGES_PER_SHOP_DAY', '1');

      await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'admitted',
        clientMessageId: 'counted-1',
      });
      // Refused on the shop budget, so it must not also consume this session's
      // allowance — a refused message that spent budget would push a retrying
      // shopper's own reset further away.
      await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'refused',
        clientMessageId: 'counted-2',
      });

      const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.messageCount).toBe(1);
    });

    it('refuses a burst on one session and reports when to retry', async () => {
      vi.stubEnv('STOREFRONT_CHAT_BURST_PER_SESSION', '1');

      const first = await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'first',
        clientMessageId: 'burst-1',
      });
      expect(first.status).toBe(202);

      const refused = await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'immediately after',
        clientMessageId: 'burst-2',
      });

      expect(refused.status).toBe(429);
      expect(refused.body.denial).toBe('session_burst');
      expect(refused.headers['retry-after']).toEqual(expect.any(String));

      // Burst is the cheapest layer and must refuse before the daily counters
      // move, or a flood would still eat the shop's day.
      const after = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(after.messageCount).toBe(1);
    });

    it('accounts the shop day under the integration that owns the session', async () => {
      await postMessage({
        organizationId: org.id,
        sessionId: session.id,
        text: 'accounted',
        clientMessageId: 'usage-1',
      });

      const usage = await db.storefrontChatDailyUsage.findMany({
        where: { organizationId: org.id },
      });
      expect(usage).toHaveLength(1);
      expect(usage[0].integrationId).toBe(integration.id);
      expect(usage[0].messageCount).toBe(1);
    });
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
