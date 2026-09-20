import type { Queue } from 'bullmq';
import { db, Prisma } from '@shopkeeper/db';
import { JOB } from '../../constants.js';
import { publishThreadEvent } from '../../realtime/publish.js';
import { removePendingPlanForThread } from '../../operator-context.js';
import type { AiSummaryJobData } from '../../types.js';
import logger from '../../logger.js';

const AI_SUMMARY_DEBOUNCE_MS = 300;

export async function enqueueAiSummaryJob(
  queue: Pick<Queue<AiSummaryJobData>, 'add'>,
  data: AiSummaryJobData,
): Promise<void> {
  await queue.add(JOB.SUMMARIZE_THREAD, data, {
    delay: AI_SUMMARY_DEBOUNCE_MS,
    // BullMQ debounce mode replaces/extends a delayed job for this thread. If
    // a job is already active, the next message becomes one trailing delayed
    // job, bounding bursts to the active run plus the newest trailing run.
    deduplication: {
      id: `thread:${data.threadId}`,
      ttl: AI_SUMMARY_DEBOUNCE_MS,
      extend: true,
      replace: true,
    },
  });
}

interface InboundProcessingData {
  summary: AiSummaryJobData | null;
  rolledOverFromThreadId: string | null;
}

// The transaction that accepts a message also writes this payload. Only clear
// it after all follow-up work succeeds; a crash may redeliver, never lose work.
export async function deliverInboundProcessing(
  messageId: string,
  queue: Pick<Queue<AiSummaryJobData>, 'add'>,
): Promise<void> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { organizationId: true, threadId: true, inboundProcessingPending: true, inboundProcessingData: true },
  });
  if (!message?.inboundProcessingPending || !message.inboundProcessingData) return;
  await db.message.update({
    where: { id: messageId },
    data: { inboundProcessingAttemptedAt: new Date() },
  });
  const data = message.inboundProcessingData as unknown as InboundProcessingData;
  // A parked card from an expired episode must not survive its rollover.
  if (data.rolledOverFromThreadId) {
    await removePendingPlanForThread(message.organizationId, data.rolledOverFromThreadId);
    await publishThreadEvent(message.organizationId, data.rolledOverFromThreadId);
  }
  if (data.summary) await enqueueAiSummaryJob(queue, data.summary);
  await publishThreadEvent(message.organizationId, message.threadId);
  await db.message.update({
    where: { id: messageId },
    data: { inboundProcessingPending: false, inboundProcessingData: Prisma.DbNull },
  });
}

export async function recoverInboundProcessing(queue: Pick<Queue<AiSummaryJobData>, 'add'>): Promise<void> {
  const pending = await db.message.findMany({
    where: { inboundProcessingPending: true, deletedAt: null },
    orderBy: [{ inboundProcessingAttemptedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: 100,
    select: { id: true },
  });
  for (const message of pending) {
    try {
      await deliverInboundProcessing(message.id, queue);
    } catch (err) {
      logger.warn({ err, messageId: message.id }, '[InboundProcessing] Delivery deferred');
    }
  }
}
