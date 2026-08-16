import { db } from '@shopkeeper/db';
import {
  getLatestConversationMessage,
  getLatestCustomerMessageText,
  requireOrgThread,
} from '@shopkeeper/agent/thread-auth';
import { readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { consumeThreadCachedPlan } from '@shopkeeper/agent/plan-execution';
import { resolveAgentSettings, isWithinBusinessHours } from '@shopkeeper/agent/settings';
import { CHANNEL } from '../constants.js';
import logger from '../logger.js';
import { getConversationBurst } from './conversation-burst.js';
import { generateThreadIntelligence } from './intelligence.js';
import {
  precomputeThreadPlan,
  sendAutoAck,
  shouldSkipRequestWork,
} from './planning.js';
import {
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';
import type { AiSummaryJobData } from '../types.js';

export const DEFAULT_PLAN_INSTRUCTION = "Handle this customer's latest request";

export function canParallelizeThreadPlanning(thread: {
  channelType: string;
  filterDecidedAt: Date | null;
  requestSourceMessageId: string | null;
}, sourceMessageId: string): boolean {
  // Any customer-origin channel whose filter can change must decide sender
  // trust before a safe reply is eligible to execute. Shopify order-event notes
  // and internal channels are never filtered and can still plan in parallel.
  const filterable = thread.channelType === CHANNEL.EMAIL
    || thread.channelType === CHANNEL.SHOPIFY_CHAT
    || thread.channelType === CHANNEL.IG_DM
    || thread.channelType === CHANNEL.TIKTOK;
  return (!filterable || thread.filterDecidedAt !== null)
    && thread.requestSourceMessageId === sourceMessageId;
}

export function resolveParallelPlanInstruction(latestCustomerMessageText: string | null): string {
  return latestCustomerMessageText?.trim() || DEFAULT_PLAN_INSTRUCTION;
}

export function resolveAiSummarySourceMessageId(
  queuedSourceMessageId: string,
  latestConversation: { id: string; senderType: string } | null,
): string {
  return latestConversation?.senderType === 'customer'
    ? latestConversation.id
    : queuedSourceMessageId;
}

type PublishDecision =
  | { publish: true; requestSummary: string | null }
  | { publish: false; reason: 'superseded' | 'parks_no_work' };

// The one gate in front of every merchant-facing park, run against a fresh read
// immediately before publishing rather than the snapshot the plan was built
// from. Between planning and here the customer can send again and the classifier
// can land its verdict — the classifier runs *in parallel* with planning on most
// channels, so a disposition read any earlier is routinely the previous burst's
// or absent entirely.
async function resolvePublishDecision(
  organizationId: string,
  threadId: string,
  identity: { planId: string; sourceMessageId: string } | undefined,
  skipSummary?: boolean,
): Promise<PublishDecision> {
  if (!identity) return { publish: true, requestSummary: null };
  const [thread, latest, burst] = await Promise.all([
    requireOrgThread(threadId, organizationId),
    getLatestConversationMessage(threadId, organizationId),
    getConversationBurst(threadId),
  ]);
  const cached = readAgentPlanCache(thread.cachedPlan);
  const isCurrent = latest?.senderType === 'customer'
    && latest.id === identity.sourceMessageId
    && thread.cachedPlanMessageId === identity.sourceMessageId
    && cached?.planId === identity.planId;
  if (!isCurrent) return { publish: false, reason: 'superseded' };

  // Only a verdict written against this exact request may speak for it. The
  // classifier compare-and-sets the request fields, so a burst that moved
  // underneath it leaves the *previous* request's disposition and summary in
  // place — and suppressing a refund because the message before it was "thanks"
  // is the one failure this gate must never produce.
  const verdictIsForThisRequest = thread.requestSourceMessageId === identity.sourceMessageId;
  if (
    verdictIsForThisRequest
    && shouldSkipRequestWork(thread, burst, identity.sourceMessageId, skipSummary)
  ) {
    return { publish: false, reason: 'parks_no_work' };
  }
  return {
    publish: true,
    requestSummary: verdictIsForThisRequest ? thread.requestSummary : null,
  };
}

export async function processAiSummaryJob(data: AiSummaryJobData): Promise<void> {
  const {
    threadId,
    organizationId,
    sourceMessageId: queuedSourceMessageId,
    customerName,
    channelType,
    traceId,
    skipSummary,
  } = data;
  logger.info({ threadId, organizationId, traceId }, '[AISummary] Processing job');

  const [threadSnapshot, latestConversation] = await Promise.all([
    db.thread.findUnique({
      where: { id: threadId },
      select: {
        channelType: true,
        filterDecidedAt: true,
        filterStatus: true,
        requestSourceMessageId: true,
      },
    }),
    getLatestConversationMessage(threadId, organizationId),
  ]);
  if (!threadSnapshot) {
    logger.warn({ threadId, organizationId }, '[AISummary] Thread not found — skipping');
    return;
  }
  const sourceMessageId = resolveAiSummarySourceMessageId(
    queuedSourceMessageId,
    latestConversation,
  );
  if (sourceMessageId !== queuedSourceMessageId) {
    logger.info(
      {
        threadId,
        organizationId,
        queuedSourceMessageId,
        sourceMessageId,
      },
      '[AISummary] Reconciled out-of-order debounce payload to newest customer message',
    );
  }

  const parallelPlan = canParallelizeThreadPlanning(threadSnapshot, sourceMessageId);

  if (
    parallelPlan
    && threadSnapshot.filterStatus
    && threadSnapshot.filterStatus !== 'genuine'
  ) {
    if (!skipSummary) {
      await generateThreadIntelligence(threadId, { skipSummary });
    }
    logger.info(
      { threadId, organizationId, classification: threadSnapshot.filterStatus },
      '[AISummary] Non-genuine thread — skipping plan precompute and notification',
    );
    return;
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings);
  const withinBusinessHours = isWithinBusinessHours(settings);

  let parallelInstruction: string | undefined;
  if (parallelPlan) {
    const latestCustomerMessageText = await getLatestCustomerMessageText(threadId, organizationId);
    parallelInstruction = resolveParallelPlanInstruction(latestCustomerMessageText);
    logger.info(
      { threadId, organizationId, channelType: threadSnapshot.channelType, planningPath: 'parallel' },
      '[AISummary] Starting plan precompute in parallel with intelligence',
    );
  }

  const intelligencePromise = generateThreadIntelligence(threadId, { skipSummary });
  const planPromise = parallelPlan
    ? precomputeThreadPlan(organizationId, threadId, settings, {
        allowAutoExecute: withinBusinessHours,
        instruction: parallelInstruction,
        sourceMessageId,
        skipSummary,
      })
    : null;

  const updatedThread = await intelligencePromise;

  if (updatedThread?.filterStatus && updatedThread.filterStatus !== 'genuine') {
    if (planPromise) {
      await planPromise.catch(() => {});
    }
    logger.info(
      { threadId, organizationId, classification: updatedThread.filterStatus },
      '[AISummary] Non-genuine thread — skipping plan precompute and notification',
    );
    return;
  }

  if (!withinBusinessHours) {
    const planResult = parallelPlan
      ? await planPromise
      : await precomputeThreadPlan(organizationId, threadId, settings, {
          allowAutoExecute: false,
          sourceMessageId,
          skipSummary,
        });
    if (planResult?.autoExecuted) {
      // Routine answers and clarification questions are useful immediately and
      // replace the generic acknowledgement. A failed send is different: the
      // merchant needs to know delivery did not happen.
      if (planResult.autoExecutionStatus !== 'success') {
        await sendOperatorAutoExecutionNotification(
          organizationId,
          threadId,
          customerName,
          channelType,
          updatedThread?.requestSummary ?? null,
          planResult,
        );
      }
      return;
    }
    const burst = await getConversationBurst(threadId);
    if (shouldSkipRequestWork(updatedThread, burst, sourceMessageId, skipSummary)) {
      logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — skipping auto-ack');
      return;
    }
    logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — sending auto-ack');
    await sendAutoAck(organizationId, threadId);
    return;
  }

  const planResult = parallelPlan
    ? await planPromise
    : await precomputeThreadPlan(organizationId, threadId, settings, {
        allowAutoExecute: true,
        sourceMessageId,
        skipSummary,
      });

  if (!planResult) {
    logger.info({ threadId, organizationId }, '[AISummary] No plan precomputed — skipping operator notification');
    return;
  }

  if (planResult.autoExecuted) {
    if (planResult.autoExecutionKind !== 'safe_reply' || planResult.autoExecutionStatus !== 'success') {
      await sendOperatorAutoExecutionNotification(
        organizationId,
        threadId,
        customerName,
        channelType,
        updatedThread?.requestSummary ?? null,
        planResult,
      );
    }
    return;
  }

  const decision = await resolvePublishDecision(
    organizationId,
    threadId,
    planResult.identity,
    skipSummary,
  );
  if (!decision.publish) {
    if (decision.reason === 'parks_no_work') {
      // Nobody asked for anything, so nothing should be waiting on any surface.
      // Dropping the cached plan is what keeps the dashboard home from raising a
      // card for the same greeting the phone was just told not to mention —
      // conditioned on the source message, so a plan for a newer burst survives.
      await consumeThreadCachedPlan({
        orgId: organizationId,
        threadId,
        lastCustomerMessageId: planResult.identity?.sourceMessageId ?? null,
      });
    }
    logger.info(
      { organizationId, threadId, sourceMessageId, reason: decision.reason },
      '[AISummary] Plan withheld from the merchant',
    );
    return;
  }

  if (planResult.merchantQuestion) {
    await sendOperatorQuestionNotification(
      organizationId,
      threadId,
      customerName,
      channelType,
      decision.requestSummary,
      planResult.merchantQuestion,
      planResult.instruction,
    );
    return;
  }

  await sendOperatorPlanNotification(
    organizationId,
    threadId,
    customerName,
    channelType,
    decision.requestSummary,
    planResult.plan,
    planResult.instruction,
    planResult.identity ? { identity: planResult.identity } : undefined,
  );
}
