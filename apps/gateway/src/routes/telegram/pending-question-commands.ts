import { db, createMessage } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { buildMerchantAnswerPlanningInstruction } from '@shopkeeper/agent/kb-learned';
import { saveMerchantAnswerToKb } from '@shopkeeper/agent/merchant-answer-kb';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { extractCachedQuestion, getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import { clearThreadPlanCache } from '@shopkeeper/agent/plan-execution';
import type { OrgSettings } from '@shopkeeper/agent/types';
import logger from '../../logger.js';
import { gatewayThreadSink } from '../../message-handlers/agent-thread-sink.js';
import { updateContext, type OperatorContext } from '../../operator-context.js';
import type { OperatorMessageContext } from '../operator-message.js';

// The operator answered an `ask_operator` question over Telegram. The reply is the
// answer: record it, persist it to the knowledge base (always — a Telegram answer is
// treated as a reusable fact), then re-plan so a normal reply rides the dashboard
// approval flow. Mirrors the dashboard answer route's ingestion; the saved answer
// re-enters planning through the KB door. Returns false when no question is pending.
export async function handlePendingQuestionAnswer(
  organizationId: string,
  message: OperatorMessageContext,
  context: OperatorContext,
): Promise<boolean> {
  if (!context.pendingQuestion) return false;
  const { chatId, body, reply, presence } = message;
  const { threadId } = context.pendingQuestion;
  const answer = body.trim();

  // The question is being answered now — clear it up front so a re-plan failure
  // can't leave the operator stuck re-answering (and re-writing the KB article).
  await updateContext(organizationId, chatId, { pendingQuestion: null });

  const [thread, latestConversation, meta] = await Promise.all([
    requireOrgThread(threadId, organizationId),
    getLatestConversationMessage(threadId),
    db.thread.findUnique({
      where: { id: threadId },
      select: {
        tag: true,
        channelType: true,
        aiSummary: true,
        customer: { select: { name: true } },
      },
    }),
  ]);
  const question = extractCachedQuestion(thread.cachedPlan);
  const customerName = meta?.customer?.name?.split(' ')[0] ?? null;

  await createMessage({
    threadId,
    senderType: 'note',
    contentText: question
      ? `Merchant answered the agent's question.\n\nQ: ${question}\nA: ${answer}`
      : `Merchant note for the agent: ${answer}`,
  });

  const saved = await saveMerchantAnswerToKb({
    organizationId,
    threadId,
    question,
    answer,
    threadTag: meta?.tag,
    channelType: meta?.channelType ?? thread.channelType,
    threadSummary: meta?.aiSummary,
  });

  const pendingCustomerMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;

  // The customer message was already handled elsewhere — nothing to re-plan against.
  if (!pendingCustomerMessageId) {
    if (thread.cachedPlan || thread.cachedPlanMessageId) {
      await clearThreadPlanCache({ orgId: organizationId, threadId });
    }
    logger.info({ organizationId, threadId, reason: 'thread_already_answered' }, '[Operator] Answer recorded, skipped re-plan');
    await reply('Got it — saved that for next time. This ticket was already handled.');
    return true;
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);
  const baseInstruction = thread.aiSummary || "Handle this customer's latest request";
  const planningInstruction = buildMerchantAnswerPlanningInstruction({
    baseInstruction,
    question,
    answer,
    saveToKb: true,
  });

  try {
    await presence(
      { kind: 'free-form' },
      async () => {
        const ctx = await buildContext(threadId, organizationId, gatewayThreadSink, {
          pinKbArticles: [{ title: saved.title, body: saved.body }],
        });
        const plan = await planAgent(ctx, planningInstruction, settings);
        await db.thread.update({
          where: { id: threadId },
          data: {
            cachedPlanMessageId: pendingCustomerMessageId,
            cachedPlan: buildAgentPlanCacheRecord({
              instruction: baseInstruction,
              lastCustomerMessageId: pendingCustomerMessageId,
              settings,
              plan,
            }) as object,
          },
        });
      },
    );
  } catch (err) {
    logger.error({ err: (err as Error).message, organizationId, threadId }, '[Operator] Answer re-plan failed');
    await reply("Saved your answer, but I couldn't draft the reply just now — you can review the ticket on your dashboard.");
    return true;
  }

  logger.info({ organizationId, threadId }, '[Operator] Answer ingested and re-planned');
  await reply(
    customerName
      ? `Got it — I've drafted a reply for ${customerName}. Review and approve it from your dashboard.`
      : "Got it — I've drafted a reply. Review and approve it from your dashboard.",
  );
  return true;
}
