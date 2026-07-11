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
  refreshSkippedPlanTerminalSendSpy,
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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'yes' } });

    await waitForReplies(1);
    expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
    expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

    await waitForReplies(1);
    expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
    expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
    const call = executeOperatorAgentTurnSpy.mock.calls[0]?.[0] as {
      approvedToolCalls: Array<{ id: string }>;
    };
    const ids = call.approvedToolCalls.map((tc) => tc.id);
    expect(ids).toEqual(['r1', 'a2']);
    expect(refreshSkippedPlanTerminalSendSpy).not.toHaveBeenCalled();
  });

  it('"skip 1" re-drafts terminal send when a send_reply is present', async () => {
    const chatId = '5555004';
    await bindMember(chatId);
    const threadId = '00000000-0000-4000-8000-000000000003';
    await updateContext(org.id, chatId, {
      pendingPlan: {
        threadId,
        instruction: 'update address',
        rawToolCalls: [
          { id: 'a1', name: 'edit_shopify_order', input: { quantity: 1 } },
          { id: 'a2', name: 'update_shopify_order_address', input: { address1: '1 Main St' } },
          { id: 's1', name: 'send_reply', input: { text: 'Added item and updated address.' } },
        ],
      },
    });

    refreshSkippedPlanTerminalSendSpy.mockResolvedValueOnce([
      { id: 'a2', name: 'update_shopify_order_address', input: { address1: '1 Main St' } },
      { id: 's2', name: 'send_reply', input: { text: 'Your address has been updated.' } },
    ]);

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

    await waitForReplies(1);
    expect(refreshSkippedPlanTerminalSendSpy).toHaveBeenCalledOnce();
    expect(executeOperatorAgentTurnSpy).toHaveBeenCalledOnce();
    expect(executeOperatorAgentTurnSpy.mock.calls[0]?.[0]).toMatchObject({
      approvedToolCalls: [
        { id: 'a2', name: 'update_shopify_order_address', input: { address1: '1 Main St' } },
        { id: 's2', name: 'send_reply', input: { text: 'Your address has been updated.' } },
      ],
    });
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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'no' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'review' } });

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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'spam 1' } });

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
        .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'reply 1 Thanks for your patience!' } });

      await waitForReplies(1);
      expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
      expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
      expect(lastReplyText()).toMatch(/Reply sent on ticket 1/);
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
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'open 5' } });

    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/No flagged ticket 5/);
  });
});

// ── HELP / SUMMARY commands ──────────────────────────────────────────────────
