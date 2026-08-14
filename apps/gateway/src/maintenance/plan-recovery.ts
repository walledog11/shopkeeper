import type { Queue } from 'bullmq';
import { db, ThreadFilterStatus } from '@shopkeeper/db';
import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { getCurrentPlanForThread } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { JOB, PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import logger from '../logger.js';
import type { AiSummaryJobData } from '../types.js';
import { enqueueAiSummaryJob } from '../message-handlers/inbound-persistence.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const RECOVERY_MIN_AGE_MS = 5 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

/**
 * Re-enter the normal planning pipeline for genuine customer messages that are
 * stranded without a plan, and for old safe replies created before automatic
 * clarification shipped. An absent plan is an operational recovery state, not
 * a merchant decision, so the morning briefing never owns this work.
 */
export async function recoverMissingPlans(
  aiSummaryQueue: Pick<Queue<AiSummaryJobData>, 'add'>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - RECOVERY_MIN_AGE_MS);
  const candidates = await db.thread.findMany({
    where: {
      status: 'open',
      filterStatus: ThreadFilterStatus.genuine,
      escalatedAt: null,
      archivedAt: null,
      deletedAt: null,
      lastMessageSenderType: SENDER_TYPE.CUSTOMER,
      updatedAt: { lte: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: RECOVERY_BATCH_SIZE,
    select: {
      id: true,
      organizationId: true,
      channelType: true,
      cachedPlan: true,
      cachedPlanMessageId: true,
      filterDecidedAt: true,
      customer: { select: { name: true } },
      organization: { select: { settings: true } },
      messages: {
        where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true },
      },
    },
  });

  let enqueued = 0;
  for (const thread of candidates) {
    const latest = thread.messages[0];
    if (!latest || latest.senderType !== SENDER_TYPE.CUSTOMER) continue;

    const currentPlan = getCurrentPlanForThread(thread, thread.messages);
    if (currentPlan) {
      const classification = classifyHomePlan(
        currentPlan,
        resolveAgentSettings(thread.organization.settings),
        { filterStatus: ThreadFilterStatus.genuine },
      );
      // Approval actions and explicit merchant questions already have an owner.
      // Only a safe reply is stranded work the agent should finish itself.
      if (classification.kind !== 'quick_reply') continue;
    }

    await enqueueAiSummaryJob(aiSummaryQueue, {
      threadId: thread.id,
      organizationId: thread.organizationId,
      sourceMessageId: latest.id,
      customerName: thread.customer.name,
      channelType: thread.channelType,
      traceId: `plan-recovery:${thread.id}`,
      ...(thread.filterDecidedAt ? { skipSummary: true } : {}),
    });
    enqueued += 1;
  }

  if (enqueued > 0) {
    logger.info({ count: enqueued }, '[PlanRecovery] Re-enqueued stranded customer work');
  }
  return enqueued;
}

export const registerPlanRecoveryMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const recoveryQueue = createMaintenanceQueue(context, QUEUE.PLAN_RECOVERY);
  const aiSummaryQueue = createMaintenanceQueue<AiSummaryJobData>(context, QUEUE.AI_SUMMARY, {
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  await scheduleRepeatableJob(
    recoveryQueue,
    JOB.PLAN_RECOVERY,
    JOB.PLAN_RECOVERY_ID,
    ONE_HOUR_MS,
  );

  const worker = createMaintenanceWorker(
    context,
    QUEUE.PLAN_RECOVERY,
    () => recoverMissingPlans(aiSummaryQueue),
    { label: 'PlanRecovery', failureQueue: 'plan-recovery' },
  );

  return { workers: [worker], queues: [recoveryQueue, aiSummaryQueue] };
};
