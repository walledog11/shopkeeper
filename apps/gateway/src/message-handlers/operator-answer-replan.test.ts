import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, SenderType } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';

const { planAgentSpy, sendOperatorPlanNotificationSpy } = vi.hoisted(() => ({
  planAgentSpy: vi.fn(),
  sendOperatorPlanNotificationSpy: vi.fn(),
}));

vi.mock('@shopkeeper/agent/planner', () => ({
  planAgent: planAgentSpy,
}));

vi.mock('./planning-notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planning-notifications.js')>();
  return {
    ...actual,
    sendOperatorPlanNotification: sendOperatorPlanNotificationSpy,
  };
});

import { applyOperatorAnswerReplan } from './operator-answer-replan.js';
import { getContext, updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  planAgentSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockReset();
  sendOperatorPlanNotificationSpy.mockResolvedValue(undefined);
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('applyOperatorAnswerReplan', () => {
  it('records the answer + KB article and clears state when the ticket was already handled', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    // An agent reply is the latest conversation message — so there is no pending
    // customer message and the re-plan (LLM) path is skipped.
    await createTestMessage(thread.id, 'Thanks for reaching out!', SenderType.agent);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id },
    });

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      chatId: 'chat_1',
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      senderRef: 'telegram:chat_1',
    });

    expect(message).toContain('already handled');
    expect(planAgentSpy).not.toHaveBeenCalled();

    // The stale plan cache is cleared.
    const refreshed = await db.thread.findUnique({
      where: { id: thread.id },
      select: { cachedPlan: true, cachedPlanMessageId: true },
    });
    expect(refreshed?.cachedPlan).toBeNull();
    expect(refreshed?.cachedPlanMessageId).toBeNull();

    // The answer is captured as a Q/A note and a reusable KB article.
    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(note?.contentText).toContain('Q: Do we ship to Canada?');
    expect(note?.contentText).toContain('A: Yes, $15 flat to Canada.');

    const article = await db.kbArticle.findFirst({ where: { organizationId: org.id } });
    expect(article?.title).toBe('International shipping');
    expect(article?.body).toContain('Q: Do we ship to Canada?');
    expect(article?.body).toContain('A: Yes, $15 flat to Canada.');
    expect(article?.tags).toEqual(['agent-learned', 'shipping']);
  });

  it('re-plans, parks the draft, and fans the card out to the other operator channels', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);

    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: 'Handle shipping question',
      lastCustomerMessageId: custMsg.id,
      settings: resolveAgentSettings(null),
      plan: {
        instruction: 'Handle shipping question',
        steps: [{
          id: 'tc1',
          category: 'internal',
          tool: 'ask_operator',
          label: 'Ask the merchant',
          description: 'Ask whether we ship to Canada',
          enabled: true,
        }],
        rawToolCalls: [{ id: 'tc1', name: 'ask_operator', input: { question: 'Do we ship to Canada?' } }],
        warnings: [],
      },
    });
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: cacheRecord as object, cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada' },
    });

    const replannedPlan = {
      instruction: 'Shipping to Canada',
      steps: [{
        id: 'tc_reply',
        category: 'write',
        tool: 'send_reply',
        label: 'Reply to customer',
        description: '"Yes, we ship to Canada for $15 flat."',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      warnings: [],
    };
    planAgentSpy.mockResolvedValue(replannedPlan);

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      chatId: 'chat_2',
      threadId: thread.id,
      answer: 'Yes, $15 flat to Canada.',
      senderRef: 'imessage:chat_2',
    });

    // The return is a model-facing draft summary carrying the concrete draft, not
    // the operator yes/no card.
    expect(message).toContain('Re-drafted');
    expect(message).toContain('Yes, we ship to Canada for $15 flat.');
    expect(message).not.toContain('Reply "yes" to send');
    expect(planAgentSpy).toHaveBeenCalledTimes(1);

    // This device is excluded from the fan-out, so it must park the display
    // fields itself or a later "no" here loses the named dismissal.
    const updatedCtx = await getContext(org.id, 'chat_2');
    expect(updatedCtx.pendingPlan).toMatchObject({
      threadId: thread.id,
      instruction: 'Shipping to Canada',
      customerName: 'Jane Doe',
      actionLabel: 'reply to Jane',
    });

    // The operator card still fans out to the merchant's other bound channels.
    expect(sendOperatorPlanNotificationSpy).toHaveBeenCalledWith(
      org.id,
      thread.id,
      'Jane Doe',
      'email',
      'Shipping to Canada',
      expect.objectContaining({
        rawToolCalls: [{ id: 'tc_reply', name: 'send_reply', input: { text: 'Yes, we ship to Canada for $15 flat.' } }],
      }),
      'Shipping to Canada',
      expect.objectContaining({ exclude: { channel: 'imessage', contextKey: 'chat_2' } }),
    );
  });

  it('does nothing destructive and returns an apologetic string when re-plan throws', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });
    const custMsg = await createTestMessage(thread.id, 'Do you ship to Canada?', SenderType.customer);
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlanMessageId: custMsg.id, aiSummary: 'Shipping to Canada' },
    });
    await updateContext(org.id, 'chat_3', { pendingQuestion: { threadId: thread.id, question: 'Ship to Canada?' } });

    planAgentSpy.mockRejectedValue(new Error('boom'));

    const message = await applyOperatorAnswerReplan({
      organizationId: org.id,
      chatId: 'chat_3',
      threadId: thread.id,
      answer: 'Yes, $15 flat.',
      senderRef: 'telegram:chat_3',
    });

    expect(message).toContain("couldn't draft the reply");
    expect(sendOperatorPlanNotificationSpy).not.toHaveBeenCalled();
  });
});
