import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import { buildOrderOpsContext, runOrderOps } from '@shopkeeper/agent/order-ops';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import type { OrderReviewJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface OrderReviewWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

// Order-ops (module #2): runs the thread-less risk reviewer in-process in the
// durable worker. Both triggers feed this queue — the orders/created webhook
// (primary) and the hourly sweep (backstop). Flag-gated by
// ORDER_RISK_MONITOR_ENABLED; findings persist as AgentAction rows.
export function createOrderReviewWorker(
  options: OrderReviewWorkerRegistrationOptions,
): Worker<OrderReviewJobData> {
  const worker = new Worker<OrderReviewJobData>(QUEUE.ORDER_REVIEW, async (job) => {
    const { organizationId, orderId, traceId } = job.data;

    if (!process.env.ORDER_RISK_MONITOR_ENABLED) return;
    if (!organizationId || !orderId) {
      logger.error({ jobId: job.id, traceId }, '[OrderReview] Job missing organizationId/orderId — dropping');
      return;
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

    // v1: flag/notify-only — the escalate sink is a quiet recorder. The finding
    // itself persists in runOrderOps' audit batch; Telegram notify is a later
    // swap of this sink, no core change.
    const escalate = async (reason: string): Promise<void> => {
      logger.info({ organizationId, orderId, reason, traceId }, '[order-ops] order flagged for review');
    };

    const ctx = await buildOrderOpsContext(orderId, organizationId, escalate);
    const result = await runOrderOps(ctx, settings);

    if (result.flagged) {
      logger.info({ organizationId, orderId, reason: result.flagReason, traceId }, '[OrderReview] order flagged');
    }
  }, options.workerOptions);

  registerJobFailureLogging(worker, {
    logMessage: '[OrderReview] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'order-review',
      organizationId: job?.data?.organizationId,
      orderId: job?.data?.orderId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
