import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { Worker } from 'bullmq';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import { isWithinBusinessHours } from '../message-handlers/business-hours.js';
import { generateThreadIntelligence } from '../message-handlers/intelligence.js';
import {
  precomputeThreadPlan,
  sendAutoAck,
} from '../message-handlers/planning.js';
import {
  sendOperatorAutoExecutionNotification,
  sendOperatorPlanNotification,
} from '../message-handlers/planning-notifications.js';
import type { AiSummaryJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export function createAiSummaryWorker(workerOptions: SharedGatewayWorkerOptions): Worker<AiSummaryJobData> {
  const worker = new Worker<AiSummaryJobData>(QUEUE.AI_SUMMARY, async (job) => {
    const { threadId, organizationId, customerName, channelType, traceId, skipSummary } = job.data;
    logger.info({ threadId, organizationId, traceId }, '[AISummary] Processing job');
    const updatedThread = await generateThreadIntelligence(threadId, { skipSummary });

    // Only genuine threads get a plan + WhatsApp notify. Questionable show in
    // the inbox but skip both; filtered skip everything downstream.
    if (updatedThread?.filterStatus && updatedThread.filterStatus !== 'genuine') {
      logger.info(
        { threadId, organizationId, classification: updatedThread.filterStatus },
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

    const planPromise = precomputeThreadPlan(organizationId, threadId, settings, {
      allowAutoExecute: withinBusinessHours,
    });

    if (!withinBusinessHours) {
      logger.info({ threadId, organizationId }, '[AISummary] Outside business hours — sending auto-ack');
      await Promise.all([planPromise, sendAutoAck(organizationId, threadId)]);
      return;
    }

    const planResult = await planPromise;
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
  }, workerOptions);

  registerJobFailureLogging(worker, {
    logMessage: '[AISummary] Job failed',
    logFields: (job) => ({ jobId: job?.id, threadId: job?.data?.threadId }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'aiSummary',
      threadId: job?.data?.threadId,
      organizationId: job?.data?.organizationId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
