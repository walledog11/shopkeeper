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
import { handlePendingQuestionAnswer } from './pending-question-commands.js';
import { getContext, updateContext } from '../../operator-context.js';
import type { TelegramReply } from './types.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('handlePendingQuestionAnswer', () => {
  it('returns false and does nothing when no question is pending', async () => {
    const reply = vi.fn<TelegramReply>();
    const ctx = await getContext(org.id, 'chat_none');

    const handled = await handlePendingQuestionAnswer(
      org.id,
      { chatId: 'chat_none', messageId: 1, body: 'random text', reply },
      ctx,
    );

    expect(handled).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });

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

    await updateContext(org.id, 'chat_1', {
      pendingQuestion: { threadId: thread.id, question: 'Do we ship to Canada?' },
    });
    const ctx = await getContext(org.id, 'chat_1');

    const reply = vi.fn<TelegramReply>();
    const handled = await handlePendingQuestionAnswer(
      org.id,
      { chatId: 'chat_1', messageId: 1, body: 'Yes, $15 flat to Canada.', reply },
      ctx,
    );

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain('already handled');

    // pendingQuestion cleared, and the stale plan cache cleared.
    expect((await getContext(org.id, 'chat_1')).pendingQuestion).toBeNull();
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
    expect(article?.title).toBe('Do we ship to Canada?');
    expect(article?.body).toBe('Yes, $15 flat to Canada.');
    expect(article?.tags).toEqual(['Support']);
  });
});
