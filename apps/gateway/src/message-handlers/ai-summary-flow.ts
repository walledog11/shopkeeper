import { db } from '@shopkeeper/db';
import {
  getLatestConversationMessage,
  getLatestCustomerMessageText,
  requireOrgThread,
} from '@shopkeeper/agent/thread-auth';
import { readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings, isWithinBusinessHours } from '@shopkeeper/agent/settings';
import { CHANNEL } from '../constants.js';
import logger from '../logger.js';
import { generateThreadIntelligence } from './intelligence.js';
import {
  precomputeThreadPlan,
  sendAutoAck,
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
}): boolean {
  // Any customer-origin channel whose filter can change must decide sender
  // trust before a safe reply is eligible to execute. Shopify order-event notes
  // and internal channels are never filtered and can still plan in parallel.
  const filterable = thread.channelType === CHANNEL.EMAIL
    || thread.channelType === CHANNEL.SHOPIFY_CHAT
    || thread.channelType === CHANNEL.IG_DM
    || thread.channelType === CHANNEL.TIKTOK;
  return !filterable || thread.filterDecidedAt !== null;
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

async function isPlanStillCurrent(
  organizationId: string,
  threadId: string,
  identity: { planId: string; sourceMessageId: string } | undefined,
): Promise<boolean> {
  if (!identity) return true;
  const [thread, latest] = await Promise.all([
    requireOrgThread(threadId, organizationId),
    getLatestConversationMessage(threadId),
  ]);
  const cached = readAgentPlanCache(thread.cachedPlan);
  return latest?.senderType === 'customer'
    && latest.id === identity.sourceMessageId
    && thread.cachedPlanMessageId === identity.sourceMessageId
    && cached?.planId === identity.planId;
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
      select: { channelType: true, filterDecidedAt: true, filterStatus: true },
    }),
    getLatestConversationMessage(threadId),
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

  const parallelPlan = canParallelizeThreadPlanning(threadSnapshot);

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
    const latestCustomerMessageText = await getLatestCustomerMessageText(threadId);
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
          updatedThread?.aiSummary ?? null,
          planResult,
        );
      }
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
        updatedThread?.aiSummary ?? null,
        planResult,
      );
    }
    return;
  }

  if (!await isPlanStillCurrent(organizationId, threadId, planResult.identity)) {
    logger.info({ organizationId, threadId, sourceMessageId }, '[AISummary] Plan was superseded before notification');
    return;
  }

  if (planResult.merchantQuestion) {
    await sendOperatorQuestionNotification(
      organizationId,
      threadId,
      customerName,
      channelType,
      updatedThread?.aiSummary ?? null,
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
    updatedThread?.aiSummary ?? null,
    planResult.plan,
    planResult.instruction,
    planResult.identity ? { identity: planResult.identity } : undefined,
  );
}
