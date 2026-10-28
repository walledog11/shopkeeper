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

describe('POST /webhooks/telegram — signature gating', () => {
  it('returns 404 when TELEGRAM_BOT_TOKEN is unset', async () => {
    const prev = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const res = await request(app)
        .post('/webhooks/telegram')
        .set('x-telegram-bot-api-secret-token', SECRET)
        .send({ message: { message_id: 1, chat: { id: 1, type: 'private' }, text: 'hi' } });
      expect(res.status).toBe(404);
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = prev;
    }
  });

  it('returns 403 when secret token header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .send({ message: { message_id: 1, chat: { id: 1, type: 'private' }, text: 'hi' } });
    expect(res.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledWith('[Telegram] Missing secret token header — rejecting.');
  });

  it('returns 403 when secret token does not match', async () => {
    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send({ message: { message_id: 1, chat: { id: 1, type: 'private' }, text: 'hi' } });
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
      .send({ message: { message_id: 1, chat: { id: 1, type: 'group' }, text: 'hi' } });
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
    await seedBindToken({
      token,
      organizationId: org.id,
      clerkUserId: 'usr_bind_1',
    });

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({
        message: {
          message_id: 1,
          from: { id: 12345, first_name: 'Raj', last_name: 'Sambi', username: 'raj_shop' },
          chat: { id: 9001, type: 'private', first_name: 'Raj', last_name: 'Sambi', username: 'raj_shop' },
          text: `/start ${token}`,
        },
      });

    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/connected/i);

    const chat = await db.orgMemberTelegramChat.findUnique({ where: { chatId: '9001' } });
    expect(chat?.orgMemberId).toBe(member.id);
    expect(chat?.telegramUserId).toBe('12345');
    expect(chat?.displayName).toBe('Raj Sambi');
    expect(chat?.username).toBe('raj_shop');
    await expect(db.orgMemberBindToken.findUnique({ where: { token } })).resolves.toBeNull();
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
    await seedBindToken({
      token,
      organizationId: org.id,
      clerkUserId: 'usr_cap',
    });

    const res = await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: 9100, type: 'private' }, text: `/start ${token}` } });

    expect(res.status).toBe(200);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/3 devices/i);
    // Token should still exist — it was not consumed
    await expect(db.orgMemberBindToken.findUnique({ where: { token } })).resolves.not.toBeNull();
  });

  it('sends a security alert to existing devices when a new one is added', async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: 'usr_alert' },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId: 'existing_chat' },
    });
    const token = 'alert-token-xyz';
    await seedBindToken({
      token,
      organizationId: org.id,
      clerkUserId: 'usr_alert',
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: 9101, type: 'private' }, text: `/start ${token}` } });

    await waitForReplies(2); // confirmation + alert to existing device
    const calls = sendMessageSpy.mock.calls as [string, string][];
    const alertCall = calls.find(([chatId]) => chatId === 'existing_chat');
    expect(alertCall?.[1]).toMatch(/new device/i);
  });

  it('replies "expired" when token is not in Postgres', async () => {
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: 9002, type: 'private' }, text: '/start missing-token' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/expired/i);
  });

  it('replies "not linked" on bare /start with no token', async () => {
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: 9003, type: 'private' }, text: '/start' } });

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
      .send({ message: { message_id: 1, chat: { id: 7777, type: 'private' }, text: 'hello' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/isn't connected/i);
  });
});

// ── Pending plan: yes / no / skip N ──────────────────────────────────────────
