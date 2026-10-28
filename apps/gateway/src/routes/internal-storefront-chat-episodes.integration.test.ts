import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ChannelType, db, SenderType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildContext, type ThreadSink } from '@shopkeeper/agent/build-context';
import { buildSystemPrompt } from '@shopkeeper/agent/prompt';
import { CHANNEL } from '../constants.js';
import { registerInternalStorefrontChatRoutes } from './internal-storefront-chat.js';
import { processInboundMessage } from '../message-handlers/inbound/inbound-persistence.js';

const queueAddSpy = vi.fn().mockResolvedValue({ id: 'test-ai-summary-job' });

vi.mock('../message-handlers/inbound/inbound-persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../message-handlers/inbound/inbound-persistence.js')>();
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

// The bug these were written against: a returning shopper's greeting landed on
// an idle open thread and the planner read the whole old conversation. Written
// red-then-pinned at P0, inverted here now that resolveInboundEpisode decides
// the boundary.
describe('POST /internal/storefront-chat/message — conversation episodes', () => {
  const REFUND_ASK = 'I want a refund for order #1024, the mug arrived cracked.';
  const REFUND_ANSWER = 'Sorry about that — I have refunded order #1024 in full.';
  const REFUND_SUMMARY =
    'Customer requested and received a full refund on order #1024 for a cracked mug.';

  const sink: ThreadSink = {
    escalateToHuman: async () => ({ status: 'ok', message: 'ok' }),
    askOperator: async () => ({ status: 'ok', message: 'ok' }),
    addInternalNote: async () => ({ status: 'ok', message: 'ok' }),
    sendReply: async () => ({ status: 'ok', message: 'ok' }),
    sendEmail: async () => ({ status: 'ok', message: 'ok' }),
    updateThreadStatus: async () => ({ status: 'ok', message: 'ok' }),
    updateThreadTag: async () => ({ status: 'ok', message: 'ok' }),
    awaitCustomerPhoto: async () => ({ status: 'ok', message: 'ok' }),
    awaitOrderVerification: async () => ({ status: 'ok', message: 'ok' }),
  };

  // A resolved refund conversation on an open thread, gone quiet `idleMs` ago,
  // with the browser session still resumable. `idleMs` is the only knob: it is
  // what P1's 24-hour storefront boundary will read.
  async function idleRefundEpisode(idleMs: number) {
    const customer = await createTestCustomer(org.id, `${CHANNEL.SHOPIFY_CHAT}:${session.id}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    const lastActivity = new Date(Date.now() - idleMs);

    await db.message.createMany({
      data: [
        {
          threadId: thread.id,
          organizationId: org.id,
          senderType: SenderType.customer,
          contentText: REFUND_ASK,
          sentAt: new Date(lastActivity.getTime() - 60_000),
        },
        {
          threadId: thread.id,
          organizationId: org.id,
          senderType: SenderType.agent,
          contentText: REFUND_ANSWER,
          sentAt: lastActivity,
        },
      ],
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { aiSummary: REFUND_SUMMARY, lastMessageAt: lastActivity },
    });
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { threadId: thread.id, customerId: customer.id },
    });
    // Every storefront thread reaches a session through inbound, which writes
    // this row in the same transaction. Omitting it here would model a session
    // state production cannot produce.
    await db.storefrontChatSessionEpisode.create({
      data: { organizationId: org.id, sessionId: session.id, threadId: thread.id },
    });

    const messages = await db.message.findMany({
      where: { threadId: thread.id },
      orderBy: { sentAt: 'asc' },
    });
    return { customer, thread, messages };
  }

  function greet(clientMessageId: string, text = 'Hi') {
    return postMessage({
      organizationId: org.id,
      sessionId: session.id,
      integrationId: integration.id,
      text,
      clientMessageId,
    });
  }

  it('opens a new episode for a three-day-later greeting', async () => {
    const { thread } = await idleRefundEpisode(3 * 24 * 60 * 60 * 1000);

    const response = await greet('episode-greeting');

    expect(response.status).toBe(202);
    expect(response.body.isNewThread).toBe(true);
    expect(response.body.threadId).not.toBe(thread.id);

    // Closed, not deleted. P4 renders the expired episode as collapsed
    // "Previous conversation" history, which needs the row and its messages.
    const old = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(old.status).toBe('closed');
    expect(old.closedReason).toBe('episode_rollover');
    expect(old.deletedAt).toBeNull();
    expect(await db.message.count({ where: { threadId: thread.id, deletedAt: null } })).toBe(2);

    // The session follows the shopper to the current episode, and its history
    // holds both — the join that keeps verified-order scope stable across the
    // boundary.
    const bound = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(bound.threadId).toBe(response.body.threadId);
    const episodes = await db.storefrontChatSessionEpisode.findMany({
      where: { sessionId: session.id },
      orderBy: { startedAt: 'asc' },
    });
    expect(episodes.map((e) => e.threadId)).toEqual([thread.id, response.body.threadId]);
    expect(episodes[0].endedAt).toBeInstanceOf(Date);
    expect(episodes[1].endedAt).toBeNull();
  });

  it('opens a new episode immediately when the merchant closed the current thread', async () => {
    const { thread } = await idleRefundEpisode(10 * 60 * 1000);
    await db.thread.update({
      where: { id: thread.id },
      data: { status: 'closed', closedReason: 'resolved' },
    });

    const response = await greet('episode-after-close', 'I have another question');

    expect(response.status).toBe(202);
    expect(response.body.isNewThread).toBe(true);
    expect(response.body.threadId).not.toBe(thread.id);

    const old = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(old.status).toBe('closed');
    expect(old.closedReason).toBe('resolved');

    const bound = await db.storefrontChatSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(bound.threadId).toBe(response.body.threadId);
    expect(await db.storefrontChatSessionEpisode.count({
      where: { sessionId: session.id },
    })).toBe(2);
  });

  it('leaves the stale refund conversation out of the greeting\'s planner context', async () => {
    await idleRefundEpisode(3 * 24 * 60 * 60 * 1000);

    const response = await greet('episode-context');

    // Deliberately the thread the greeting actually landed on rather than a
    // captured id: this is the planner's real input either way.
    const ctx = await buildContext(response.body.threadId, org.id, sink);
    const texts = ctx.recentMessages.map((message) => message.contentText);

    expect(texts).toEqual(['Hi']);
    expect(texts).not.toContain(REFUND_ASK);
    expect(texts).not.toContain(REFUND_ANSWER);

    // generate-thread-plan.ts uses thread.aiSummary verbatim as the planning
    // instruction when no explicit one is passed. A fresh episode has none, so
    // "Hi" can no longer be planned as if the shopper had re-opened the refund.
    // Item A removes that fallback outright.
    expect(ctx.thread.aiSummary).toBeNull();

    // Nothing else the closed episode owns reaches the model either. Rollover
    // leaves aiSummary on the closed thread, and buildContext used to reload it
    // through a "three most recent closed threads" query; the storefront prompt
    // happened to drop that section, so it never rendered here, but the query
    // ran on every turn and did reach the email and Instagram prompts. The
    // context field is gone entirely now, which the type system enforces —
    // this asserts the shopper-visible half of it.
    expect(buildSystemPrompt(ctx)).not.toContain(REFUND_SUMMARY);
  });

  it('expires the old episode\'s cached plan instead of carrying it forward', async () => {
    const { thread, messages } = await idleRefundEpisode(3 * 24 * 60 * 60 * 1000);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlan: { steps: [{ tool: 'refund_order' }] },
        cachedPlanMessageId: messages[0].id,
      },
    });

    const response = await greet('episode-cached-plan');

    // A plan written from a conversation that has since ended must not be
    // approvable, and must never be copied into its successor. Genuinely
    // unresolved work survives as a CustomerObligation (P5) instead.
    const old = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(old.cachedPlan).toBeNull();
    expect(old.cachedPlanMessageId).toBeNull();

    const fresh = await db.thread.findUniqueOrThrow({ where: { id: response.body.threadId } });
    expect(fresh.cachedPlan).toBeNull();
    expect(fresh.cachedPlanMessageId).toBeNull();
  });

  // The reason episode resolution holds a row lock on the customer. Without
  // it both requests see no current episode, both close the expired one, and
  // threads_one_open_per_customer rejects the loser only after it has already
  // done so — leaving the shopper with no open thread at all.
  it('creates exactly one episode for two concurrent messages after expiry', async () => {
    const { thread } = await idleRefundEpisode(3 * 24 * 60 * 60 * 1000);

    const [first, second] = await Promise.all([
      greet('episode-race-a', 'Hi'),
      greet('episode-race-b', 'Are you there?'),
    ]);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.threadId).toBe(second.body.threadId);
    expect(first.body.threadId).not.toBe(thread.id);

    const open = await db.thread.findMany({
      where: { organizationId: org.id, channelType: ChannelType.shopify_chat, status: 'open' },
    });
    expect(open).toHaveLength(1);

    // Both messages survive; neither request is silently dropped to win the race.
    const texts = await db.message.findMany({
      where: { threadId: open[0].id, senderType: SenderType.customer },
      select: { contentText: true },
    });
    expect(texts.map((t) => t.contentText).sort()).toEqual(['Are you there?', 'Hi']);
  });

  it('keeps a retried greeting in one episode', async () => {
    const { thread } = await idleRefundEpisode(3 * 24 * 60 * 60 * 1000);

    const first = await greet('episode-retry');
    const second = await greet('episode-retry');

    expect(first.status).toBe(202);
    // Dedupe rolls the whole transaction back, so the retry cannot manufacture
    // a second episode out of the same client message id.
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ deduped: true });

    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: ChannelType.shopify_chat },
    });
    expect(threads).toHaveLength(2);
    expect(threads.filter((t) => t.status === 'open')).toHaveLength(1);
    expect(await db.storefrontChatSessionEpisode.count({ where: { sessionId: session.id } })).toBe(2);
    expect(thread.id).not.toBe(first.body.threadId);
  });

  // The control. A short gap is a follow-up, not a new conversation, so this
  // one must pass identically before and after P1 — it is what proves the
  // boundary is a boundary and not just "always start a new thread".
  it('keeps a ten-minute follow-up in the same episode', async () => {
    const { thread } = await idleRefundEpisode(10 * 60 * 1000);

    const response = await greet('episode-followup', 'Any update on that refund?');

    expect(response.status).toBe(202);
    expect(response.body.isNewThread).toBe(false);
    expect(response.body.threadId).toBe(thread.id);

    const ctx = await buildContext(response.body.threadId, org.id, sink);
    const texts = ctx.recentMessages.map((message) => message.contentText);

    expect(texts).toContain('Any update on that refund?');
    expect(texts).toContain(REFUND_ASK);
    expect(ctx.thread.aiSummary).toContain('#1024');
  });
});
