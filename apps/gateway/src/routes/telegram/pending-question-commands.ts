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
import type { AgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import logger from '../../logger.js';
import { gatewayThreadSink } from '../../message-handlers/agent-thread-sink.js';
import { toGatewayAgentPlan } from '../../message-handlers/agent-plan-adapter.js';
import { sendOperatorPlanNotification } from '../../message-handlers/planning-notifications.js';
import { updateContext, type OperatorContext } from '../../operator-context.js';
import type { OperatorMessageContext } from '../operator-message.js';

// The operator answered an `ask_operator` question over Telegram. The reply is the
// answer: record it, persist it to the knowledge base (always — an operator-channel
// answer is treated as a reusable fact), then re-plan and push the draft reply plan
// over iMessage/Telegram for yes/no approval. Mirrors the dashboard answer route's
// ingestion; the saved answer re-enters planning through the KB door. Returns false
// when no question is pending.
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

  let plan: AgentPlan;
  try {
    plan = await presence(
      { kind: 'free-form' },
      async () => {
        const ctx = await buildContext(threadId, organizationId, gatewayThreadSink, {
          pinKbArticles: [{ title: saved.title, body: saved.body }],
        });
        const replanned = await planAgent(ctx, planningInstruction, settings);
        await db.thread.update({
          where: { id: threadId },
          data: {
            cachedPlanMessageId: pendingCustomerMessageId,
            cachedPlan: buildAgentPlanCacheRecord({
              instruction: baseInstruction,
              lastCustomerMessageId: pendingCustomerMessageId,
              settings,
              plan: replanned,
            }) as object,
          },
        });
        return replanned;
      },
    );
  } catch (err) {
    logger.error({ err: (err as Error).message, organizationId, threadId }, '[Operator] Answer re-plan failed');
    await reply("Saved your answer, but I couldn't draft the reply just now — please try again in a moment.");
    return true;
  }

  try {
    const notifyPlan = toGatewayAgentPlan(plan);
    if (!notifyPlan) {
      throw new Error('re-planned plan missing');
    }
    await sendOperatorPlanNotification(
      organizationId,
      threadId,
      meta?.customer?.name ?? null,
      meta?.channelType ?? thread.channelType,
      meta?.aiSummary ?? null,
      notifyPlan,
      baseInstruction,
    );
  } catch (err) {
    logger.error({ err: (err as Error).message, organizationId, threadId }, '[Operator] Answer plan notification failed');
    await reply("Saved your answer and drafted a reply, but I couldn't deliver the plan just now — check your dashboard.");
    return true;
  }

  logger.info({ organizationId, threadId }, '[Operator] Answer ingested and re-planned');
  return true;
}
