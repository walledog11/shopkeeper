import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { updateContext, getContext } from '../operator-context.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// In-memory backing store for the ioredis mock so the /start bind flow can
// round-trip telegram:bind:<token> values.
const { mockLogger, redisStore, incrStore, sendMessageSpy, executeOperatorAgentTurnSpy } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  redisStore: new Map<string, string>(),
  incrStore: new Map<string, number>(),
  sendMessageSpy: vi.fn().mockResolvedValue(undefined),
  executeOperatorAgentTurnSpy: vi.fn().mockResolvedValue({
    summary: 'Done.',
    threadId: '00000000-0000-4000-8000-000000000001',
    actionsPerformed: [],
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
    this.incr = vi.fn(async (key: string) => {
      const next = (incrStore.get(key) ?? 0) + 1;
      incrStore.set(key, next);
      return next;
    });
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

vi.mock('../logger.js', () => ({
  default: mockLogger,
}));

vi.mock('../message-handlers/execute-operator-agent-turn.js', () => ({
  executeOperatorAgentTurn: executeOperatorAgentTurnSpy,
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
  incrStore.clear();
  sendMessageSpy.mockClear();
  executeOperatorAgentTurnSpy.mockClear();
  executeOperatorAgentTurnSpy.mockResolvedValue({
    summary: 'Done.',
    threadId: '00000000-0000-4000-8000-000000000001',
    actionsPerformed: [],
  });
  mockLogger.debug.mockClear();
  mockLogger.error.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
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
    expect(mockLogger.warn).toHaveBeenCalledWith('[Telegram] Missing secret token header — rejecting.');
  });

  it('returns 403 when secret token does not match', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send({ message: { chat: { id: 1, type: 'private' }, text: 'hi' } });
    expect(res.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledWith('[Telegram] Secret token mismatch — rejecting request.');
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

    const chat = await db.orgMemberTelegramChat.findUnique({ where: { chatId: '9001' } });
    expect(chat?.orgMemberId).toBe(member.id);
    expect(redisStore.has(`telegram:bind:${token}`)).toBe(false);
  });

  it('enforces the device cap and replies with a limit message', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: 'usr_cap' },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: member.id, chatId: 'cap_chat_1' },
        { orgMemberId: member.id, chatId: 'cap_chat_2' },
        { orgMemberId: member.id, chatId: 'cap_chat_3' },
      ],
    });
    const token = 'cap-token-xyz';
    redisStore.set(
      `telegram:bind:${token}`,
      JSON.stringify({ orgId: org.id, clerkUserId: 'usr_cap' }),
    );

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 9100, type: 'private' }, text: `/start ${token}` } });

    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/3 devices/i);
    // Token should still be in Redis — it was not consumed
    expect(redisStore.has(`telegram:bind:${token}`)).toBe(true);
  });

  it('sends a security alert to existing devices when a new one is added', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: 'usr_alert' },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: 'existing_chat' },
    });
    const token = 'alert-token-xyz';
    redisStore.set(
      `telegram:bind:${token}`,
      JSON.stringify({ orgId: org.id, clerkUserId: 'usr_alert' }),
    );

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: 9101, type: 'private' }, text: `/start ${token}` } });

    await waitForReplies(2); // confirmation + alert to existing device
    const calls = sendMessageSpy.mock.calls as [string, string][];
    const alertCall = calls.find(([chatId]) => chatId === 'existing_chat');
    expect(alertCall?.[1]).toMatch(/new device/i);
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
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    return member;
  }

  it('"yes" runs the agent with rawToolCalls as approvedToolCalls', async () => {
    const chatId = '5555001';
    await bindMember(chatId);
    const threadId = '00000000-0000-4000-8000-000000000001';
    await updateContext(org.id, chatId, {
      pendingPlan: {
        threadId,
        instruction: 'refund #1',
        rawToolCalls: [{ id: 'tc1', name: 'refundOrder', amount: 5 }],
      },
    });

    executeOperatorAgentTurnSpy.mockResolvedValueOnce({
      summary: 'Refunded.',
      threadId,
      actionsPerformed: [],
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'yes' } });

    // Filler reply first, then the agent summary reply.
    await waitForReplies(2);
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledOnce();
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledWith({
      orgId: org.id,
      threadId,
      instruction: 'refund #1',
      approvedToolCalls: [{ id: 'tc1', name: 'refundOrder', input: { amount: 5 } }],
      clerkUserId: `usr_${chatId}`,
    });
    expect(lastReplyText()).toBe('Refunded.');

    const ctx = await getContext(org.id, chatId);
    expect(ctx.pendingPlan).toBeNull();
    expect(ctx.lastThreadId).toBe(threadId);
  });

  it('"skip 1" drops the first actionable tool call', async () => {
    const chatId = '5555002';
    await bindMember(chatId);
    const threadId = '00000000-0000-4000-8000-000000000002';
    await updateContext(org.id, chatId, {
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

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

    await waitForReplies(2);
    const call = executeOperatorAgentTurnSpy.mock.calls[0]?.[0] as {
      approvedToolCalls: Array<{ id: string }>;
    };
    const ids = call.approvedToolCalls.map((tc) => tc.id);
    expect(ids).toEqual(['r1', 'a2']);
  });

  it('"no" clears pendingPlan without calling the agent', async () => {
    const chatId = '5555003';
    await bindMember(chatId);
    await updateContext(org.id, chatId, {
      pendingPlan: { threadId: 't', instruction: 'i', rawToolCalls: [] },
    });
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'no' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/dismissed/i);
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    const ctx = await getContext(org.id, chatId);
    expect(ctx.pendingPlan).toBeNull();
  });
});

// ── Digest commands: review / spam N / reply N ───────────────────────────────
describe('POST /webhooks/telegram — digest commands', () => {
  async function setupDigest(opts: { customerName?: string; aiSummary?: string | null } = {}) {
    const chatId = `${6000000 + Math.floor(Math.random() * 999_999)}`;
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
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
    await updateContext(org.id, chatId, {
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

// ── HELP / SUMMARY commands ──────────────────────────────────────────────────
describe('POST /webhooks/telegram — help & summary', () => {
  async function bindMember(chatId: string) {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    return member;
  }

  it('"help" lists the available commands without touching the DB feed', async () => {
    const chatId = '7500001';
    await bindMember(chatId);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'help' } });

    await waitForReplies(1);
    const text = lastReplyText();
    expect(text).toMatch(/Shopkeeper commands/);
    expect(text).toMatch(/SUMMARY/);
    expect(text).toMatch(/OPEN <n>/);
  });

  it('"summary" sends the live inbox digest and seeds pendingDigest', async () => {
    const chatId = '7500002';
    await bindMember(chatId);
    const customer = await createTestCustomer(org.id, `cust_${chatId}@test.com`, { name: 'Dana' });
    const flagged = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: flagged.id },
      data: { filterStatus: 'questionable', aiSummary: 'Wholesale pricing question' },
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

    await waitForReplies(1);
    const text = lastReplyText();
    expect(text).toMatch(/support inbox/i);
    expect(text).toMatch(/Flagged \(review needed\): 1/);
    expect(text).toMatch(/1\. Dana — Wholesale pricing question/);

    const ctx = await getContext(org.id, chatId);
    expect(ctx.pendingDigest?.threadIds).toEqual([flagged.id]);
  });

  it('"summary" replies that the inbox is empty when there are no open tickets', async () => {
    const chatId = '7500003';
    await bindMember(chatId);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/inbox is empty/i);
  });
});

// ── Order lookup #1234 ───────────────────────────────────────────────────────
describe('POST /webhooks/telegram — order lookup', () => {
  it('replies with thread context when #N matches an open thread', async () => {
    const chatId = '7000001';
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
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

    const ctx = await getContext(org.id, chatId);
    expect(ctx.lastOrderNumber).toBe('#4242');
    expect(ctx.lastThreadId).toBe(thread.id);
  });
});

// ── Free-form instruction ────────────────────────────────────────────────────
describe('POST /webhooks/telegram — free-form instruction', () => {
  it('runs arbitrary text in-process and updates history', async () => {
    const chatId = '8000001';
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    const newThreadId = '00000000-0000-4000-8000-000000000099';
    executeOperatorAgentTurnSpy.mockResolvedValueOnce({
      summary: 'Looked it up.',
      threadId: newThreadId,
      actionsPerformed: [],
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'how many orders today?' } });

    await waitForReplies(2);
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledOnce();
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledWith({
      orgId: org.id,
      instruction: 'how many orders today?',
      senderPhone: `telegram:${chatId}`,
      clerkUserId: `usr_${chatId}`,
    });
    expect(lastReplyText()).toBe('Looked it up.');

    const ctx = await getContext(org.id, chatId);
    expect(ctx.lastThreadId).toBe(newThreadId);
    expect(ctx.history.map((m) => m.content)).toContain('how many orders today?');
    expect(ctx.history.map((m) => m.content)).toContain('Looked it up.');
  });
});

// ── Per-chatId rate limit ────────────────────────────────────────────────────
describe('POST /webhooks/telegram — per-chatId rate limit', () => {
  function primeCounter(chatId: string, count: number) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / 60);
    incrStore.set(`rl:webhook:telegram:${chatId}:${windowStart}`, count);
  }

  it('drops the request silently when the per-chat limit is exceeded', async () => {
    const chatId = '9100001';
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    primeCounter(chatId, 30);

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'hi' } });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
  });

  it('allows requests under the limit', async () => {
    const chatId = '9100002';
    primeCounter(chatId, 29);

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(chatId), type: 'private' }, text: 'hello' } });

    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/isn't connected/i);
  });

  it('rate-limits chatIds independently', async () => {
    const blockedChat = '9100003';
    const freeChat = '9100004';
    primeCounter(blockedChat, 30);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(blockedChat), type: 'private' }, text: 'hi' } });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { chat: { id: Number(freeChat), type: 'private' }, text: 'hi' } });

    await waitForReplies(1);
    expect(sendMessageSpy.mock.calls.length).toBe(1);
    expect(sendMessageSpy.mock.calls[0][0]).toBe(freeChat);
  });
});
