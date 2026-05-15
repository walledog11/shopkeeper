import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';
import { updateContext, getContext } from '../operator-context.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// In-memory backing store for the ioredis mock so the /start bind flow can
// round-trip telegram:bind:<token> values.
const { redisStore, sendMessageSpy } = vi.hoisted(() => ({
  redisStore: new Map<string, string>(),
  sendMessageSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
    this.incr = vi.fn().mockResolvedValue(1);
    this.expire = vi.fn().mockResolvedValue(1);
    this.get = vi.fn(async (key: string) => redisStore.get(key) ?? null);
    this.set = vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    });
    this.setex = vi.fn(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    });
    this.del = vi.fn(async (key: string) => {
      const had = redisStore.delete(key);
      return had ? 1 : 0;
    });
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = vi.fn().mockResolvedValue({ id: 'test-job-id' });
    this.close = vi.fn();
  }),
  Worker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
}));

vi.mock('../clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => process.env.TELEGRAM_BOT_TOKEN != null && process.env.TELEGRAM_BOT_TOKEN !== ''),
  sendMessage: sendMessageSpy,
  setWebhook: vi.fn(),
}));

import { registerTelegramWebhookRoutes } from './webhooks-telegram.js';

function createApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  const router = express.Router();
  registerTelegramWebhookRoutes(router);
  app.use('/webhooks', router);
  return app;
}

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
let org!: Awaited<ReturnType<typeof createTestOrg>>;
const app = createApp();

// Wait until the fire-and-forget reply lands. The route does res.send before
// doing async work, so supertest resolves before sendMessage is called.
async function waitForReplies(count: number, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (sendMessageSpy.mock.calls.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${count} reply (got ${sendMessageSpy.mock.calls.length})`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function lastReplyText(): string {
  const calls = sendMessageSpy.mock.calls;
  if (calls.length === 0) return '';
  return calls[calls.length - 1][1] as string;
}

beforeEach(async () => {
  org = await createTestOrg();
  redisStore.clear();
  sendMessageSpy.mockClear();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await db.orgMember.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

// ── Signature gating ─────────────────────────────────────────────────────────
describe('POST /webhooks/telegram — signature gating', () => {
  it('returns 404 when TELEGRAM_BOT_TOKEN is unset', async () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const res = await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: 1, type: 'private' }, text: 'hi' } });
      expect(res.status).toBe(404);
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = prev;
    }
  });

  it('returns 403 when secret token header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .send({ message: { chat: { id: 1, type: 'private' }, text: 'hi' } });
    expect(res.status).toBe(403);
  });

  it('returns 403 when secret token does not match', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send({ message: { chat: { id: 1, type: 'private' }, text: 'hi' } });
    expect(res.status).toBe(403);
  });

  it('returns 200 silently when message is missing', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({});
    expect(res.status).toBe(200);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('replies and rejects non-private chats', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 1, type: 'group' }, text: 'hi' } });
    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/1:1 chats/i);
  });
});

// ── /start <token> bind flow ─────────────────────────────────────────────────
describe('POST /webhooks/telegram — /start bind', () => {
  it('binds chatId to OrgMember when token is valid', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: 'usr_bind_1' },
    });
    const token = 'bind-token-abc';
    redisStore.set(
      `telegram:bind:${token}`,
      JSON.stringify({ orgId: org.id, clerkUserId: 'usr_bind_1' }),
    );

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 9001, type: 'private' }, text: `/start ${token}` } });

    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/connected/i);

    const updated = await db.orgMember.findUnique({ where: { id: member.id } });
    expect(updated?.telegramChatId).toBe('9001');
    expect(redisStore.has(`telegram:bind:${token}`)).toBe(false);
  });

  it('replies "expired" when token is not in Redis', async () => {
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 9002, type: 'private' }, text: '/start missing-token' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/expired/i);
  });

  it('replies "not linked" on bare /start with no token', async () => {
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 9003, type: 'private' }, text: '/start' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/isn't linked/i);
  });
});

// ── Unbound chat ─────────────────────────────────────────────────────────────
describe('POST /webhooks/telegram — unbound chat', () => {
  it('replies with bind instructions when no OrgMember matches the chatId', async () => {
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 7777, type: 'private' }, text: 'hello' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/isn't connected/i);
  });
});

// ── Pending plan: yes / no / skip N ──────────────────────────────────────────
describe('POST /webhooks/telegram — pending plan commands', () => {
  async function bindMember(chatId: string) {
    return db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `usr_${chatId}`,
        telegramChatId: chatId,
      },
    });
  }

  it('"yes" runs the agent with rawToolCalls as approvedToolCalls', async () => {
    const chatId = '5555001';
    await bindMember(chatId);
    const threadId = '00000000-0000-4000-8000-000000000001';
    await updateContext(org.id, 'telegram', chatId, {
      pendingPlan: {
        threadId,
        instruction: 'refund #1',
        rawToolCalls: [{ id: 'tc1', name: 'refundOrder', amount: 5 }],
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: 'Refunded.' }), { status: 200 }),
    );

    try {
      await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'yes' } });

      // Filler reply first, then the agent summary reply.
      await waitForReplies(2);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/agent\/internal$/);
      const body = JSON.parse(init.body as string);
      expect(body.threadId).toBe(threadId);
      expect(body.approvedToolCalls).toEqual([{ id: 'tc1', name: 'refundOrder', amount: 5 }]);
      expect(body.telegramChatId).toBe(chatId);
      expect(lastReplyText()).toBe('Refunded.');

      const ctx = await getContext(org.id, 'telegram', chatId);
      expect(ctx.pendingPlan).toBeNull();
      expect(ctx.lastThreadId).toBe(threadId);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('"skip 1" drops the first actionable tool call', async () => {
    const chatId = '5555002';
    await bindMember(chatId);
    const threadId = '00000000-0000-4000-8000-000000000002';
    await updateContext(org.id, 'telegram', chatId, {
      pendingPlan: {
        threadId,
        instruction: 'do things',
        rawToolCalls: [
          { id: 'r1', name: 'get_shopify_orders' }, // read, retained
          { id: 'a1', name: 'refund_order' }, // actionable[0] → skipped
          { id: 'a2', name: 'cancel_order' }, // actionable[1] → retained
        ],
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: 'Done.' }), { status: 200 }),
    );
    try {
      await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

      await waitForReplies(2);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      const ids = (body.approvedToolCalls as Array<{ id: string }>).map((tc) => tc.id);
      expect(ids).toEqual(['r1', 'a2']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('"no" clears pendingPlan without calling the agent', async () => {
    const chatId = '5555003';
    await bindMember(chatId);
    await updateContext(org.id, 'telegram', chatId, {
      pendingPlan: { threadId: 't', instruction: 'i', rawToolCalls: [] },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'no' } });

      await waitForReplies(1);
      expect(lastReplyText()).toMatch(/dismissed/i);
      expect(fetchSpy).not.toHaveBeenCalled();
      const ctx = await getContext(org.id, 'telegram', chatId);
      expect(ctx.pendingPlan).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ── Digest commands: review / spam N / reply N ───────────────────────────────
describe('POST /webhooks/telegram — digest commands', () => {
  async function setupDigest(opts: { customerName?: string; aiSummary?: string | null } = {}) {
    const chatId = `${6000000 + Math.floor(Math.random() * 999_999)}`;
    await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `usr_${chatId}`,
        telegramChatId: chatId,
      },
    });
    const customer = await createTestCustomer(org.id, `cust_${chatId}@test.com`, {
      name: opts.customerName ?? 'Jane',
    });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        filterStatus: 'questionable',
        filterReason: 'No order context',
        aiSummary: opts.aiSummary ?? null,
      },
    });
    await updateContext(org.id, 'telegram', chatId, {
      pendingDigest: { threadIds: [thread.id], sentAt: new Date().toISOString() },
    });
    return { chatId, threadId: thread.id };
  }

  it('"review" lists flagged threads', async () => {
    const { chatId } = await setupDigest({ customerName: 'Alice', aiSummary: 'Asking for refund' });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'review' } });

    await waitForReplies(1);
    const text = lastReplyText();
    expect(text).toMatch(/Flagged tickets/);
    expect(text).toMatch(/1\. Alice/);
    expect(text).toMatch(/Asking for refund/);
  });

  it('"spam 1" marks the thread filtered', async () => {
    const { chatId, threadId } = await setupDigest();

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'spam 1' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/spam/i);
    const updated = await db.thread.findUnique({ where: { id: threadId } });
    expect(updated?.filterStatus).toBe('filtered');
    expect(updated?.filterFeedback).toBe('confirmed_spam');
  });

  it('"reply 1 <text>" posts to /api/messages/internal', async () => {
    const { chatId, threadId } = await setupDigest();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    try {
      await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'reply 1 Thanks for your patience!' } });

      // Filler reply + final reply.
      await waitForReplies(2);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/messages\/internal$/);
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ threadId, text: 'Thanks for your patience!' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('"open 5" with out-of-range index replies friendly error', async () => {
    const { chatId } = await setupDigest();

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'open 5' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/No flagged ticket 5/);
  });
});

// ── Order lookup #1234 ───────────────────────────────────────────────────────
describe('POST /webhooks/telegram — order lookup', () => {
  it('replies with thread context when #N matches an open thread', async () => {
    const chatId = '7000001';
    await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `usr_${chatId}`,
        telegramChatId: chatId,
      },
    });
    const customer = await createTestCustomer(org.id, `cust_${chatId}@test.com`, { name: 'Carol' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Where is order #4242?');

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: '#4242' } });

    await waitForReplies(1);
    const text = lastReplyText();
    expect(text).toMatch(/#4242/);
    expect(text).toMatch(/Carol/);

    const ctx = await getContext(org.id, 'telegram', chatId);
    expect(ctx.lastOrderNumber).toBe('#4242');
    expect(ctx.lastThreadId).toBe(thread.id);
  });
});

// ── Free-form instruction ────────────────────────────────────────────────────
describe('POST /webhooks/telegram — free-form instruction', () => {
  it('forwards arbitrary text to /api/agent/internal and updates history', async () => {
    const chatId = '8000001';
    await db.orgMember.create({
      data: {
        organizationId: org.id,
        clerkUserId: `usr_${chatId}`,
        telegramChatId: chatId,
      },
    });
    const newThreadId = '00000000-0000-4000-8000-000000000099';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: 'Looked it up.', threadId: newThreadId }), { status: 200 }),
    );

    try {
      await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'how many orders today?' } });

      await waitForReplies(2);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/agent\/internal$/);
      const body = JSON.parse(init.body as string);
      expect(body.instruction).toBe('how many orders today?');
      expect(body.telegramChatId).toBe(chatId);
      expect(lastReplyText()).toBe('Looked it up.');

      const ctx = await getContext(org.id, 'telegram', chatId);
      expect(ctx.lastThreadId).toBe(newThreadId);
      expect(ctx.history.map((m) => m.content)).toContain('how many orders today?');
      expect(ctx.history.map((m) => m.content)).toContain('Looked it up.');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
