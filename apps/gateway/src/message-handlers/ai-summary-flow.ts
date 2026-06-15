import { db } from '@shopkeeper/db';
import { getLatestCustomerMessageText } from '@shopkeeper/agent/thread-auth';
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
} from './planning-notifications.js';
import type { AiSummaryJobData } from '../types.js';

export const DEFAULT_PLAN_INSTRUCTION = "Handle this customer's latest request";

export function canParallelizeThreadPlanning(thread: {
  channelType: string;
  filterDecidedAt: Date | null;
}): boolean {
  // Email first messages wait for the spam filter; follow-ups and non-email
  // channels can plan while intelligence refreshes summary/tag.
  return thread.channelType !== CHANNEL.EMAIL || thread.filterDecidedAt !== null;
}

export function resolveParallelPlanInstruction(latestCustomerMessageText: string | null): string {
  return latestCustomerMessageText?.trim() || DEFAULT_PLAN_INSTRUCTION;
}

export async function processAiSummaryJob(data: AiSummaryJobData): Promise<void> {
  const { threadId, organizationId, customerName, channelType, traceId, skipSummary } = data;
  logger.info({ threadId, organizationId, traceId }, '[AISummary] Processing job');

  const threadSnapshot = await db.thread.findUnique({
    where: { id: threadId },
    select: { channelType: true, filterDecidedAt: true, filterStatus: true },
  });
  if (!threadSnapshot) {
    logger.warn({ threadId, organizationId }, '[AISummary] Thread not found — skipping');
    return;
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
    logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — sending auto-ack');
    await Promise.all([
      parallelPlan
        ? planPromise!
        : precomputeThreadPlan(organizationId, threadId, settings, { allowAutoExecute: false }),
      sendAutoAck(organizationId, threadId),
    ]);
    return;
  }

  const planResult = parallelPlan
    ? await planPromise
    : await precomputeThreadPlan(organizationId, threadId, settings, {
        allowAutoExecute: true,
      });

  if (!planResult) {
    logger.info({ threadId, organizationId }, '[AISummary] No plan precomputed — skipping operator notification');
    return;
  }

  if (planResult.autoExecuted) {
    await sendOperatorAutoExecutionNotification(
      organizationId,
      threadId,
      customerName,
      channelType,
      updatedThread?.aiSummary ?? null,
      planResult,
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
  );
}
