/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestMessage,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { getContext, updateContext } from '../operator-context.js';
import {
  SECRET,
  lastReplyText,
  seedBindToken,
  telegramFixture,
  waitForReplies,
} from '../test-fixtures/telegram-webhook-test-fixture.js';

const {
  app,
  executeOperatorAgentTurnSpy,
  incrStore,
  mockLogger,
  sendChatActionSpy,
  sendMessageSpy,
  setMessageReactionSpy,
} = telegramFixture;
let org: { id: string };

beforeEach(() => {
  org = telegramFixture.org;
});

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'help' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: '#4242' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'how many orders today?' } });

    await waitForReplies(1);
    expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
    expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'hi' } });

    expect(res.status).toBe(200);
    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
  });

  it('allows requests under the limit', async () => {
    const chatId = '9100002';
    primeCounter(chatId, 29);

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'hello' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(blockedChat), type: 'private' }, text: 'hi' } });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(freeChat), type: 'private' }, text: 'hi' } });

    await waitForReplies(1);
    expect(sendMessageSpy.mock.calls.length).toBe(1);
    expect(sendMessageSpy.mock.calls[0][0]).toBe(freeChat);
  });
});
