import { db, createMessage } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { buildMerchantAnswerPlanningInstruction } from '@shopkeeper/agent/kb-learned';
import { saveMerchantAnswerToKb } from '@shopkeeper/agent/merchant-answer-kb';
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from '@shopkeeper/agent/plan-cache';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { extractCachedQuestion, getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import { clearThreadPlanCache } from '@shopkeeper/agent/plan-execution';
import type { AgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import logger from '../logger.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import {
  formatOperatorDraftSummary,
  parkedActionLabel,
  sendOperatorPlanNotification,
  type OperatorNotificationExclude,
} from './planning-notifications.js';
import { updateContext, type ToolCall } from '../operator-context.js';

function answeringChannelFromSenderRef(senderRef: string): OperatorNotificationExclude | null {
  if (senderRef.startsWith('imessage:')) {
    return { channel: 'imessage', contextKey: senderRef.slice('imessage:'.length) };
  }
  if (senderRef.startsWith('telegram:')) {
    return { channel: 'telegram', contextKey: senderRef.slice('telegram:'.length) };
  }
  return null;
}

function toPendingPlanToolCalls(
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
): ToolCall[] {
  return rawToolCalls.map((toolCall) => ({ ...toolCall }));
}

export interface OperatorAnswerReplanParams {
  organizationId: string;
  chatId: string;
  threadId: string;
  // The merchant's freeform text: an answer to a pending question, or revision
  // guidance for a pending plan. Recorded as a note, saved to the KB as a
  // reusable fact, and folded into the re-plan.
  answer: string;
  senderRef: string;
}

// Ingests a merchant's answer/guidance for a thread and re-drafts its plan:
// record a note, persist the fact to the knowledge base, re-plan with the fact
// pinned, update the pending plan, and notify the *other* operator channels.
// Returns a model-facing draft summary; the answer/revise control tools return it
// as their tool result and the model relays it. Never throws — a failure resolves
// to an apologetic status string.
export async function applyOperatorAnswerReplan(
  params: OperatorAnswerReplanParams,
): Promise<string> {
  const { organizationId, chatId, threadId, senderRef } = params;
  const answer = params.answer.trim();

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
    return 'Got it — saved that for next time. This ticket was already handled.';
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

  const doReplan = async (): Promise<{ plan: AgentPlan; cacheRecord: ReturnType<typeof buildAgentPlanCacheRecord> }> => {
    const ctx = await buildContext(threadId, organizationId, gatewayThreadSink, {
      pinKbArticles: [{ title: saved.title, body: saved.body }],
    });
    const replanned = await planAgent(ctx, planningInstruction, settings);
    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: baseInstruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings,
      plan: replanned,
    });
    const committed = await commitThreadPlanCacheIfCurrent({
      orgId: organizationId,
      threadId,
      sourceMessageId: pendingCustomerMessageId,
      cache: cacheRecord,
    });
    if (!committed) throw new Error('Customer message changed while re-planning');
    return { plan: replanned, cacheRecord };
  };

  let plan: AgentPlan;
  let cacheRecord: ReturnType<typeof buildAgentPlanCacheRecord>;
  try {
    ({ plan, cacheRecord } = await doReplan());
  } catch (err) {
    logger.error({ err: (err as Error).message, organizationId, threadId }, '[Operator] Answer re-plan failed');
    return "Saved your answer, but I couldn't draft the reply just now — please try again in a moment.";
  }

  const notifyPlan = toGatewayAgentPlan(plan);
  if (!notifyPlan) {
    logger.error({ organizationId, threadId }, '[Operator] Answer re-plan produced no notify plan');
    return "Saved your answer, but I couldn't draft the reply just now — please try again in a moment.";
  }

  const exclude = answeringChannelFromSenderRef(senderRef);
  const customerName = meta?.customer?.name ?? null;
  const draftSummary = formatOperatorDraftSummary(customerName, notifyPlan);
  // This device is excluded from the fan-out below, so it parks its own copy —
  // including the display fields the fan-out would otherwise have supplied.
  const actionLabel = parkedActionLabel(notifyPlan.steps, customerName);
  const pendingPlan = {
    threadId,
    instruction: baseInstruction,
    rawToolCalls: toPendingPlanToolCalls(notifyPlan.rawToolCalls),
    ...(cacheRecord.planId && cacheRecord.lastCustomerMessageId ? {
      planId: cacheRecord.planId,
      sourceMessageId: cacheRecord.lastCustomerMessageId,
      planHash: hashPlan(plan),
      instructionHash: hashInstruction(baseInstruction),
    } : {}),
    ...(customerName ? { customerName } : {}),
    ...(actionLabel ? { actionLabel } : {}),
  };

  await updateContext(organizationId, chatId, { pendingPlan });

  // The answering operator gets the draft summary as this call's return value (the
  // control tool relays it through the model); here we only fan the operator card
  // out to the *other* bound operator channels.
  try {
    await sendOperatorPlanNotification(
      organizationId,
      threadId,
      meta?.customer?.name ?? null,
      meta?.channelType ?? thread.channelType,
      meta?.aiSummary ?? null,
      notifyPlan,
      baseInstruction,
      {
        ...(exclude ? { exclude } : {}),
        ...(cacheRecord.planId && cacheRecord.lastCustomerMessageId ? {
          identity: {
            planId: cacheRecord.planId,
            sourceMessageId: cacheRecord.lastCustomerMessageId,
            planHash: hashPlan(plan),
            instructionHash: hashInstruction(baseInstruction),
          },
        } : {}),
      },
    );
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, organizationId, threadId },
      '[Operator] Answer plan delivered to answerer; other operator channels failed',
    );
  }

  logger.info({ organizationId, threadId }, '[Operator] Answer ingested and re-planned');
  return draftSummary;
}
