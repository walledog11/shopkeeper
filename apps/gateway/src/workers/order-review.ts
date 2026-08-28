import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import { buildOrderOpsContext, runOrderOps } from '@shopkeeper/agent/order-ops';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { OrgSettings } from '@shopkeeper/agent/types';
import {
  CONTROLLED_QUEUE_RECOVERY_FAILURE,
  JOB,
  QUEUE,
} from '../constants.js';
import {
  UNTRUSTED_CLOSE_TAG,
  UNTRUSTED_OPEN_TAG,
} from '@shopkeeper/agent/message-history';
import { isOrderRiskMonitorEnabled } from '../config/runtime-config.js';
import { truncateBriefingText } from '../maintenance/digest-briefing/index.js';
import logger from '../logger.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';
import type { OrderReviewJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface OrderReviewWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

// Push alerts stay short; mirror text can carry the full model reason for thread history.
const MAX_PUSH_REASON_CHARS = 280;
const MAX_MIRROR_REASON_CHARS = 600;

// The reason is model-authored prose over order fields the buyer controls —
// name, email, address lines, order notes — and notifyOperator mirrors the body
// onto the operator thread, where a later operator turn reads it back as history
// (operator mode runs with segregateUntrusted off, and a mirrored push is an
// `agent` row, so nothing downstream will wrap it). Flatten model prose to one
// line, cap the length, and defang forged boundary tags here. Full-blown wrapUntrusted is
// deliberately not used: every existing call site wraps a MODEL-facing string,
// and this string is what the merchant reads on their phone.
function defangFlagReason(reason: string): string {
  return reason
    .replace(/\s+/g, ' ')
    .trim()
    .split(UNTRUSTED_OPEN_TAG)
    .join('<customer_message >')
    .split(UNTRUSTED_CLOSE_TAG)
    .join('</customer_message >');
}

export function formatOrderFlagNotification(
  orderName: string,
  reason: string,
  maxReasonChars = MAX_PUSH_REASON_CHARS,
): string {
  const flat = defangFlagReason(reason);
  const truncated = flat.length > maxReasonChars;
  const detail = truncated ? truncateBriefingText(flat, maxReasonChars) : flat;
  const headsUp = `Heads up — order ${orderName} looks worth a second look`;
  const suffix = "I haven't touched it; nothing is on hold.";
  if (!detail) return `${headsUp}.\n\n${suffix}`;
  const reasonBlock = truncated ? detail : `${detail}.`;
  return `${headsUp}:\n\n${reasonBlock}\n\n${suffix}`;
}

// Decision 4 (2026-08-04): order-ops is notify-only. The flag reaches every bound
// operator channel and stops there — no plan is parked, so the context patch is
// empty and there is nothing for the merchant to approve. Best-effort by design:
// notifyOperator swallows send failures rather than throwing, because a throw
// here would fail the job and make BullMQ re-run the whole model review to retry
// a text message.
async function notifyFlaggedOrder(
  organizationId: string,
  orderId: string,
  orderName: string,
  reason: string,
  traceId: string | undefined,
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);
  if (bindings.length === 0) {
    logger.info(
      { organizationId, orderId, traceId },
      '[OrderReview] order flagged but no operator channels are bound — finding recorded only',
    );
    return;
  }

  const body = formatOrderFlagNotification(orderName, reason);
  const mirrorBody = formatOrderFlagNotification(orderName, reason, MAX_MIRROR_REASON_CHARS);
  const idempotencyKey = `order-risk:${organizationId}:${orderId}`;
  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(organizationId, member, body, {}, {
      idempotencyKey,
      mirrorBody,
    });
    if (result) notified += 1;
  }
  logger.info(
    { organizationId, orderId, traceId, bindings: bindings.length, notified },
    '[OrderReview] flag notification fanned out',
  );
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

    // P6-02 production recovery exercise. This named job has no business
    // operation: its first processing attempt fails deterministically, and a
    // manual retry of the same BullMQ identity succeeds without touching the
    // database, a provider, or the model.
    if (job.name === JOB.CONTROLLED_QUEUE_RECOVERY) {
      if (job.attemptsMade === 0) {
        throw new Error(CONTROLLED_QUEUE_RECOVERY_FAILURE);
      }
      logger.info(
        { jobId: job.id, traceId, attemptsMade: job.attemptsMade },
        '[OrderReview] Controlled queue recovery canary completed',
      );
      return;
    }

    if (!isOrderRiskMonitorEnabled()) return;
    if (!organizationId || !orderId) {
      logger.error({ jobId: job.id, traceId }, '[OrderReview] Job missing organizationId/orderId — dropping');
      return;
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

    // The sink stays a quiet recorder: it runs inside the model loop, and
    // runOrderOps swallows anything it throws, so network I/O does not belong
    // here. Operator delivery happens after the run returns, off the loop.
    const escalate = async (reason: string): Promise<void> => {
      logger.info({ organizationId, orderId, reason, traceId }, '[order-ops] order flagged for review');
    };

    const ctx = await buildOrderOpsContext(orderId, organizationId, escalate);
    const result = await runOrderOps(ctx, settings);

    if (result.flagged) {
      logger.info({ organizationId, orderId, reason: result.flagReason, traceId }, '[OrderReview] order flagged');
      await notifyFlaggedOrder(
        organizationId,
        orderId,
        ctx.order.name,
        result.flagReason ?? '',
        traceId,
      );
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
