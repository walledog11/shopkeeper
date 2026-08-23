/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestCustomer,
  createTestMessage,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { AgentPlan, PlanValidation } from '@shopkeeper/agent/types';
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

describe('POST /webhooks/telegram — pending plan commands', () => {
  // Operator state hangs off the person, so binding a chat also tells us which
  // queue that chat's messages will read.
  async function bindMember(chatId: string) {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: `usr_${chatId}` },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: member.id, chatId },
    });
    return `member:${member.id}`;
  }

  async function parkCurrentPlan(params: {
    memberKey: string;
    instruction: string;
    rawToolCalls: AgentPlan['rawToolCalls'];
    validation?: PlanValidation;
    customerName?: string;
    actionLabel?: string;
  }) {
    const customer = await createTestCustomer(
      org.id,
      `plan_${params.memberKey.replace(':', '_')}@test.com`,
    );
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const sourceMessage = await createTestMessage(thread.id, 'Please help with this request.');
    const validation = params.validation ?? { status: 'valid' as const, issues: [] };
    const plan: AgentPlan = {
      instruction: params.instruction,
      steps: params.rawToolCalls.map((toolCall, index) => ({
        id: toolCall.id,
        tool: toolCall.name,
        label: `Step ${index + 1}`,
        description: `Run ${toolCall.name}`,
        category: toolCall.name === 'send_reply' ? 'communication' : 'action',
        enabled: true,
      })),
      rawToolCalls: params.rawToolCalls,
      validation,
    };
    const cache = buildAgentPlanCacheRecord({
      instruction: params.instruction,
      lastCustomerMessageId: sourceMessage.id,
      settings: resolveAgentSettings(null),
      plan,
    });
    const expectedIdentity = {
      planId: cache.planId!,
      sourceMessageId: sourceMessage.id,
      planHash: hashPlan(cache.plan),
      instructionHash: hashInstruction(params.instruction),
    };
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cache as object, cachedPlanMessageId: sourceMessage.id },
    });
    await updateContext(org.id, params.memberKey, {
      pendingPlan: {
        threadId: thread.id,
        instruction: params.instruction,
        rawToolCalls: params.rawToolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        })),
        validation,
        ...expectedIdentity,
        ...(params.customerName ? { customerName: params.customerName } : {}),
        ...(params.actionLabel ? { actionLabel: params.actionLabel } : {}),
      },
    });
    return { threadId: thread.id, expectedIdentity };
  }

  it('"yes" runs the agent with rawToolCalls as approvedToolCalls', async () => {
    const chatId = '5555001';
    const memberKey = await bindMember(chatId);
    const { threadId, expectedIdentity } = await parkCurrentPlan({
      memberKey,
      instruction: 'refund #1',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder', input: { amount: 5 } }],
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

    await processPendingOperatorEvents(org.id);
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
      expectedIdentity,
    });
    expect(lastReplyText()).toBe('Refunded.');

    const ctx = await getContext(org.id, memberKey);
    expect(ctx.pendingPlan).toBeNull();
  });

  it('does not run or discard a plan that requires thread review', async () => {
    const chatId = '5555012';
    const memberKey = await bindMember(chatId);
    const { threadId, expectedIdentity } = await parkCurrentPlan({
      memberKey,
      instruction: 'refund #10',
      rawToolCalls: [{ id: 'tc1', name: 'refundOrder', input: { amount: 5 } }],
    });
    await updateContext(org.id, memberKey, {
      pendingDigest: {
        items: [{
          threadId,
          kind: 'approval',
          planId: expectedIdentity.planId,
          needsThreadReview: true,
        }],
        threadIds: [],
        sentAt: new Date().toISOString(),
      },
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'yes' } });
    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);

    expect(lastReplyText()).toContain('Open the thread before deciding');
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    expect((await getContext(org.id, memberKey)).pendingPlan).toMatchObject({ planId: expectedIdentity.planId });
  });

  it.each(['yes', 'skip 1'])('%s cannot run a validation-failed draft', async (command) => {
    const chatId = command === 'yes' ? '5555010' : '5555011';
    const memberKey = await bindMember(chatId);
    const { threadId } = await parkCurrentPlan({
      memberKey,
      instruction: 'Reply',
      rawToolCalls: [{ id: 's1', name: 'send_reply', input: { text: '' } }],
      validation: {
        status: 'invalid',
        issues: [{ code: 'invalid_tool_input', message: 'The reply text cannot be blank.' }],
      },
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: command } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    expect(lastReplyText()).toContain('failed validation');
    expect((await getContext(org.id, memberKey)).pendingPlans.at(-1)?.threadId).toBe(threadId);
  });

  it('"skip 1" drops the first actionable tool call', async () => {
    const chatId = '5555002';
    const memberKey = await bindMember(chatId);
    const { threadId } = await parkCurrentPlan({
      memberKey,
      instruction: 'do things',
      rawToolCalls: [
        { id: 'r1', name: 'get_shopify_orders', input: {} }, // read, retained
        { id: 'r2', name: 'get_order_tracking', input: {} }, // canonical read, retained
        { id: 'a1', name: 'refund_order', input: {} }, // actionable[0] → skipped
        { id: 'a2', name: 'cancel_order', input: {} }, // actionable[1] → retained
      ],
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
    expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
    const call = executeOperatorAgentTurnSpy.mock.calls[0]?.[0] as {
      approvedToolCalls: Array<{ id: string }>;
    };
    const ids = call.approvedToolCalls.map((tc) => tc.id);
    expect(ids).toEqual(['r1', 'r2', 'a2']);
  });

  it('"skip 1" requires revision when a terminal send would change', async () => {
    const chatId = '5555004';
    const memberKey = await bindMember(chatId);
    const { threadId } = await parkCurrentPlan({
      memberKey,
      instruction: 'update address',
      rawToolCalls: [
        { id: 'a1', name: 'edit_shopify_order', input: { quantity: 1 } },
        { id: 'a2', name: 'update_shopify_order_address', input: { address1: '1 Main St' } },
        { id: 's1', name: 'send_reply', input: { text: 'Added item and updated address.' } },
      ],
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'skip 1' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    expect(lastReplyText()).toContain("I've run nothing");

    const context = await getContext(org.id, memberKey);
    expect(context.pendingPlans.at(-1)?.threadId).toBe(threadId);
  });

  // Older parked plans have no actionLabel — the fast path must still answer.
  it('"no" clears pendingPlan without calling the agent', async () => {
    const chatId = '5555003';
    const memberKey = await bindMember(chatId);
    await parkCurrentPlan({
      memberKey,
      instruction: 'i',
      rawToolCalls: [],
    });
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'no' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).toBe('Plan dismissed.');
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    const ctx = await getContext(org.id, memberKey);
    expect(ctx.pendingPlan).toBeNull();
  });

  it('"no" names the dropped action when the plan parked a label', async () => {
    const chatId = '5555005';
    const memberKey = await bindMember(chatId);
    await parkCurrentPlan({
      memberKey,
      instruction: 'refund #1',
      rawToolCalls: [],
      customerName: 'Sarah Chen',
      actionLabel: 'reply to Sarah',
    });
    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'no' } });

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).toBe("Dismissed — I won't reply to Sarah.");
    expect(executeOperatorAgentTurnSpy).not.toHaveBeenCalled();
    const ctx = await getContext(org.id, memberKey);
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
    await updateContext(org.id, `member:${member.id}`, {
      pendingDigest: {
        items: [{ threadId: thread.id, kind: 'flagged' as const }],
        threadIds: [thread.id],
        sentAt: new Date().toISOString(),
      },
    });
    return { chatId, threadId: thread.id, memberKey: `member:${member.id}` };
  }

  it('"review" lists flagged threads', async () => {
    const { chatId } = await setupDigest({ customerName: 'Alice', aiSummary: 'Asking for refund' });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'review' } });

    await processPendingOperatorEvents(org.id);
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

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).toBe("Marked Jane's message as spam.");
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

      await processPendingOperatorEvents(org.id);
      await waitForReplies(1);
      expect(setMessageReactionSpy).toHaveBeenCalledWith(chatId, 1, '👀');
      expect(sendChatActionSpy).toHaveBeenCalledWith(chatId, 'typing');
      expect(lastReplyText()).toBe('Replied to Jane — "Thanks for your patience!"');
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

    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).toMatch(/There's no 5 on that list/);
  });

  it('opens a thread-review item but refuses a blind action command', async () => {
    const { chatId, threadId, memberKey } = await setupDigest({
      customerName: 'Inez',
      aiSummary: 'Original request needs review',
    });
    await updateContext(org.id, memberKey, {
      pendingDigest: {
        items: [{
          threadId,
          kind: 'approval',
          planId: 'plan-review',
          needsThreadReview: true,
        }],
        threadIds: [],
        sentAt: new Date().toISOString(),
      },
    });

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 1, chat: { id: Number(chatId), type: 'private' }, text: 'spam 1' } });
    await processPendingOperatorEvents(org.id);
    await waitForReplies(1);
    expect(lastReplyText()).toBe('Open number 1 before deciding what to do with it.');

    await request(app)
      .post('/webhooks/telegram')
      .set('x-telegram-bot-api-secret-token', SECRET)
      .send({ message: { message_id: 2, chat: { id: Number(chatId), type: 'private' }, text: 'open 1' } });
    await processPendingOperatorEvents(org.id);
    await waitForReplies(2);
    expect(lastReplyText()).toContain('1. Inez');
    expect(lastReplyText()).toContain('Original request needs review');
  });
});

// ── HELP / SUMMARY commands ──────────────────────────────────────────────────
