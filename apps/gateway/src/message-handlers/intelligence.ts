import { db, isSpendCapError, SenderType } from '@shopkeeper/db';
import logger from '../logger.js';
import { publishThreadEvent } from '../realtime/publish.js';
import { MODEL } from '../constants.js';
import { enforceSpendCap, recordSpend } from '@shopkeeper/agent/spend';
import { readModelUsage } from '@shopkeeper/agent/usage';
import { anthropic } from '@shopkeeper/agent/ai';
import {
  CONTEXT_BUDGETS,
  buildBoundedClassifierConversation,
  resolveContextBudgetMode,
} from '@shopkeeper/agent/context-budget';
import {
  classifierSignals,
  classifierSystemPrompt,
  parseClassifierJson,
  resolveFilterDecision,
} from './email-classification.js';
import { listVerifiedOrderNames } from '../storefront-chat-verified-orders.js';
import { getConversationBurst } from './conversation-burst.js';

export async function generateThreadIntelligence(
  threadId: string,
  opts?: { skipSummary?: boolean },
) {
  try {
    // skipSummary path: email worker already classified pre-persistence; the
    // thread row is fully populated. Return it as-is so downstream plan
    // precompute + operator notify can still run.
    if (opts?.skipSummary) {
      return db.thread.findUnique({ where: { id: threadId } });
    }

    logger.info({ threadId }, '[Worker] Generating AI Summary');
    const contextBudgetMode = resolveContextBudgetMode();
    const fullThread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: contextBudgetMode === 'enforce'
          ? {
              where: { senderType: { not: SenderType.note } },
              orderBy: { sentAt: 'desc' },
              take: CONTEXT_BUDGETS.classifierMessageCount,
            }
          : {
              where: { senderType: { not: SenderType.note } },
              orderBy: { sentAt: 'asc' },
            },
      },
    });

    if (!fullThread) return null;

    const chronologicalMessages = contextBudgetMode === 'enforce'
      ? [...fullThread.messages].reverse()
      : fullThread.messages;
    const boundedConversation = buildBoundedClassifierConversation(
      chronologicalMessages,
      fullThread.aiSummary,
    );
    const episodeText = contextBudgetMode === 'enforce'
      ? boundedConversation.text
      : chronologicalMessages
      .map((m) => `${m.senderType.toUpperCase()}: ${m.contentText}`)
      .join('\n');

    // The burst is named for the model rather than left to be inferred from the
    // transcript's tail: "what are they asking now" and "what has this
    // conversation been about" are different questions, and the whole point of
    // requestSummary is that the second one stops answering the first.
    const burst = await getConversationBurst(threadId);
    const conversationText = `${episodeText}\n\n--- CURRENT REQUEST ---\n${
      burst.messages.length > 0
        ? burst.messages.map((m) => `CUSTOMER: ${m.contentText ?? ''}`).join('\n')
        : '(no unanswered customer message)'
    }`;

    if (contextBudgetMode !== 'off') {
      logger.info({
        threadId,
        organizationId: fullThread.organizationId,
        purpose: 'thread_intelligence',
        mode: contextBudgetMode,
        context: boundedConversation.stats,
      }, '[Worker] AI input budget');
    }

    await enforceSpendCap(fullThread.organizationId, null);

    const verifiedOrderNames = await listVerifiedOrderNames(
      fullThread.organizationId,
      fullThread.id,
      fullThread.channelType,
    );

    const aiResponse = await anthropic.messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 400,
      system: classifierSystemPrompt(fullThread.channelType, verifiedOrderNames),
      messages: [{ role: 'user', content: conversationText }],
    });
    const usage = readModelUsage(aiResponse);
    await recordSpend(fullThread.organizationId, usage, MODEL.CLAUDE);
    logger.info({
      threadId,
      organizationId: fullThread.organizationId,
      purpose: 'thread_intelligence',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      inputChars: conversationText.length,
    }, '[Worker] AI model usage');

    const block = aiResponse.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    const aiData = parseClassifierJson(block.text);

    // filterDecidedAt is the lock: once any path commits a decision, subsequent
    // summaries refresh aiSummary/tag but don't reclassify. Which channels are
    // filtered at all, and how far the verdict may go on each, is
    // `resolveFilterDecision` — null means this channel is not filtered and the
    // thread keeps the genuine default.
    const filterDecision = fullThread.filterDecidedAt === null
      ? resolveFilterDecision(fullThread.channelType, aiData.filterStatus)
      : null;

    // Compare-and-set on the request half only. The episode summary describes
    // everything said so far and stays true however the conversation moved on,
    // but a request summary written against a burst the customer has already
    // added to would instruct the planner with a stale ask. Re-read the burst
    // after the model call; if it moved, keep the episode fields and drop the
    // request ones rather than persisting a request nobody made.
    const settledBurst = await getConversationBurst(threadId);
    const sourceMessageId = burst.messages.at(-1)?.id ?? null;
    const requestIsCurrent = (settledBurst.messages.at(-1)?.id ?? null) === sourceMessageId;
    if (!requestIsCurrent) {
      logger.info(
        { threadId, organizationId: fullThread.organizationId, sourceMessageId },
        '[Worker] Discarding superseded request summary',
      );
    }

    const updated = await db.thread.update({
      where: { id: threadId },
      data: {
        aiTitle: aiData.title,
        aiSummary: aiData.summary,
        tag: aiData.tag,
        classifierSignals: classifierSignals(aiData),
        ...(requestIsCurrent && {
          requestSummary: aiData.requestSummary || null,
          requestDisposition: aiData.requestDisposition,
          requestSourceMessageId: sourceMessageId,
        }),
        ...(filterDecision && {
          filterStatus: filterDecision,
          filterReason: aiData.filterReason,
          filterDecidedAt: new Date(),
        }),
      },
    });

    logger.info({ tag: aiData.tag, summary: aiData.summary, classification: updated.filterStatus, threadId }, '[Worker] AI Summary saved');

    // Live inbox: summary/tag refreshed — push so the thread card updates.
    await publishThreadEvent(updated.organizationId, threadId);

    return updated;
  } catch (aiError) {
    if (isSpendCapError(aiError)) {
      // Daily cap reached — leave the thread without a fresh aiSummary/tag.
      // The next call after midnight UTC will refresh it.
      logger.warn({ threadId }, '[Worker] AI summary skipped — daily LLM spend cap reached');
      return db.thread.findUnique({ where: { id: threadId } });
    }
    logger.error({ err: aiError, threadId }, '[Worker] Failed to generate AI summary');
    throw aiError;
  }
}
