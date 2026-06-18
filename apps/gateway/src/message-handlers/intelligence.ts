import { db, isSpendCapError, SenderType } from '@shopkeeper/db';
import logger from '../logger.js';
import { CHANNEL, MODEL } from '../constants.js';
import { enforceSpendCap, recordSpend } from '@shopkeeper/agent/spend';
import { readModelUsage } from '@shopkeeper/agent/usage';
import { anthropic } from '@shopkeeper/agent/ai';
import {
  CLASSIFIER_SYSTEM_PROMPT,
  parseClassifierJson,
} from './email-classification.js';

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
    const fullThread = await db.thread.findUnique({
      where: { id: threadId },
      include: { messages: { where: { senderType: { not: SenderType.note } }, orderBy: { sentAt: 'asc' } } },
    });

    if (!fullThread) return null;

    const conversationText = fullThread.messages
      .map((m) => `${m.senderType.toUpperCase()}: ${m.contentText}`)
      .join('\n');

    await enforceSpendCap(fullThread.organizationId, null);

    const aiResponse = await anthropic.messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });
    await recordSpend(fullThread.organizationId, readModelUsage(aiResponse), MODEL.CLAUDE);

    const block = aiResponse.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    const aiData = parseClassifierJson(block.text);

    // filterDecidedAt is the lock: once any path commits a decision, subsequent
    // summaries refresh aiSummary/tag but don't reclassify.
    // Spam filter scope is email only — IG/Shopify/SMS threads stay genuine
    // regardless of what the classifier says (Shopify order events read like
    // "automated system alerts" and would be wrongly purged otherwise).
    const shouldSetFilter = fullThread.filterDecidedAt === null && fullThread.channelType === CHANNEL.EMAIL;

    const updated = await db.thread.update({
      where: { id: threadId },
      data: {
        aiTitle: aiData.title,
        aiSummary: aiData.summary,
        tag: aiData.tag,
        ...(shouldSetFilter && {
          filterStatus: aiData.filterStatus,
          filterReason: aiData.filterReason,
          filterDecidedAt: new Date(),
        }),
      },
    });

    logger.info({ tag: aiData.tag, summary: aiData.summary, classification: updated.filterStatus, threadId }, '[Worker] AI Summary saved');

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
