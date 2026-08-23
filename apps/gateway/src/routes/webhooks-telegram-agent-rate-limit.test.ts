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
  processPendingOperatorEvents,
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
  // Returns the key the chat's operator state lives under: the person, not the chat.
  async function bindMember(chatId: string) {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    return `member:${member.id}`;
  }

  it('"help" leads with what to say and keeps commands as a trailing hint', async () => {
    const chatId = '7500001';
    await bindMember(chatId);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'help' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    const text = lastReplyText();
    expect(text).toMatch(/^Text me like you'd text an employee:/);
    expect(text).toMatch(/refund #1234/);
    expect(text).toMatch(/reply yes or no/);
    // Commands still documented, but below the capabilities.
    expect(text).toMatch(/SUMMARY/);
    expect(text).toMatch(/OPEN <n>/);
    expect(text.indexOf('SUMMARY')).toBeGreaterThan(text.indexOf('refund #1234'));
  });

  it('"summary" sends the live inbox digest and seeds pendingDigest', async () => {
    const chatId = '7500002';
    const memberKey = await bindMember(chatId);
    const customer = await createTestCustomer(org.id, `cust_${chatId}@test.com`, { name: 'Dana' });
    const flagged = await createTestThread(org.id, customer.id, ChannelType.email);
    const sourceMessage = await createTestMessage(flagged.id, 'Do you offer wholesale pricing?');
    await db.thread.update({
      where: { id: flagged.id },
      data: {
        filterStatus: 'questionable',
        aiTitle: 'Wholesale pricing question',
        requestSourceMessageId: sourceMessage.id,
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: {
            mutative_request: false,
            policy_question: true,
            order_status: false,
            fraud_signals: false,
            contradiction: false,
            out_of_scope_commercial: false,
            forwarded_injection: false,
            no_request: false,
          },
          requestFacts: {
            ask: 'policy_question',
            subject: 'wholesale pricing',
            order: null,
            deadline: null,
            deadlineText: null,
            alternative: null,
          },
        },
      },
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    const text = lastReplyText();
    // On-demand SUMMARY answers straight out — the greeting is the scheduled
    // send's job, not a reply to a merchant who just asked.
    expect(text).not.toContain("didn't send any replies");
    // A flagged ticket is work: it is in the one numbered list with everything
    // else, not in a block of its own with its own question.
    expect(text).toContain('One sender looks questionable.');
    expect(text).toContain('Dana: policy question — wholesale pricing.');

    const ctx = await getContext(org.id, memberKey);
    expect(ctx.pendingDigest?.threadIds).toEqual([flagged.id]);
  });

  it('"summary" replies that the inbox is empty when there are no open tickets', async () => {
    const chatId = '7500003';
    await bindMember(chatId);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'summary' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).not.toContain("didn't send any replies");
    expect(lastReplyText()).not.toContain('need you');
    expect(lastReplyText()).toContain('Nothing needs you right now.');
  });
});

// ── Order references now flow to the agent as free-form ──────────────────────
describe('POST /webhooks/telegram — order reference', () => {
  it('dispatches a bare #N order reference to the agent as a free-form turn', async () => {
    const chatId = '7000001';
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    executeOperatorAgentTurnSpy.mockResolvedValueOnce({
      summary: 'Order #4242 shipped yesterday.',
      threadId: '00000000-0000-4000-8000-000000000042',
      actionsPerformed: [],
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: '#4242' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    // The keyword order-lookup command is gone — the agent resolves the order.
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: '#4242', operatorKey: `member:${member.id}` }),
    );
    expect(lastReplyText()).toBe('Order #4242 shipped yesterday.');
  });
});

// ── Free-form instruction ────────────────────────────────────────────────────
describe('POST /webhooks/telegram — free-form instruction', () => {
  it('runs arbitrary text through the durable operator-event worker', async () => {
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

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
    expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledOnce();
    // The freeform turn targets the merchant's durable operator thread via their
    // member key — the same thread every one of their transports uses. It no longer
    // threads an order number or a prior thread id, and it carries the pending-state
    // ledger and the operator control tools. senderPhone stays the device, for audit.
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledWith({
      orgId: org.id,
      instruction: 'how many orders today?',
      operatorKey: `member:${member.id}`,
      senderPhone: `telegram:${chatId}`,
      clerkUserId: `usr_${chatId}`,
      turnId: expect.any(String),
      operatorLedger: expect.any(String),
      operatorDeskMode: false,
      moduleTools: expect.any(Object),
    });
    expect(lastReplyText()).toBe('Looked it up.');
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
