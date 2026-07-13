import { db } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Channel-agnostic reconciler for stale outbound rows. An unclaimed `pending`
// row or a `processing` claim that died before a provider attempt is a known
// no-send failure and may be retried. Once `sendAttemptedAt` is present, provider
// acceptance is ambiguous; mark the row `unknown` so the UI and operators do
// not trigger a potentially duplicate send.
const STALE_PENDING_MS = 10 * 60 * 1000;
// Kept well above the DB's autosuspend window so the compute can scale to zero
// between runs; this is a backstop, not the primary send path.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_ERROR = 'Send did not complete — message was queued but never sent. Retry to resend.';
const UNKNOWN_SWEEP_ERROR = 'Delivery could not be confirmed after the provider attempt. Do not retry until the provider activity is reconciled.';

export async function runOutboundSendSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);

  const [pending, unattempted, attempted] = await retryAfterDbReconnect(() => db.$transaction([
    db.message.updateMany({
      where: { sendStatus: 'pending', sentAt: { lt: cutoff } },
      data: { sendStatus: 'failed', sendClaimToken: null, sendError: SWEEP_ERROR },
    }),
    db.message.updateMany({
      where: {
        sendStatus: 'processing',
        sendClaimedAt: { lt: cutoff },
        sendAttemptedAt: null,
      },
      data: { sendStatus: 'failed', sendClaimToken: null, sendError: SWEEP_ERROR },
    }),
    db.message.updateMany({
      where: {
        sendStatus: 'processing',
        sendClaimedAt: { lt: cutoff },
        sendAttemptedAt: { not: null },
      },
      data: { sendStatus: 'unknown', sendClaimToken: null, sendError: UNKNOWN_SWEEP_ERROR },
    }),
  ]));

  const failedCount = pending.count + unattempted.count;
  if (failedCount > 0 || attempted.count > 0) {
    logger.error(
      { opsAlert: true, failedCount, unknownCount: attempted.count },
      '[OutboundSendSweep] Reconciled orphaned outbound send claims',
    );
  }
}

export const registerOutboundSendSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.OUTBOUND_SEND_SWEEP);
  await scheduleRepeatableJob(queue, JOB.OUTBOUND_SEND_SWEEP, JOB.OUTBOUND_SEND_SWEEP_ID, SWEEP_INTERVAL_MS);

  const worker = createMaintenanceWorker(context, QUEUE.OUTBOUND_SEND_SWEEP, runOutboundSendSweep, {
    label: 'OutboundSendSweep',
    failureQueue: 'outbound-send-sweep',
  });

  return { workers: [worker], queues: [queue] };
};

async function retryAfterDbReconnect<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isDbConnectionClosedError(error)) {
      throw error;
    }

    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      '[OutboundSendSweep] DB connection was closed; reconnecting and retrying once',
    );
    await db.$disconnect().catch(() => {});
    return operation();
  }
}

function isDbConnectionClosedError(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name}\n${error.message}\n${error.stack ?? ''}`
    : String(error);

  return [
    'Server has closed the connection',
    'Error in PostgreSQL connection',
    'kind: Closed',
    'P1017',
  ].some((needle) => message.includes(needle))
    || /connection (?:was )?(?:closed|terminated)/i.test(message)
    || /closed (?:the )?connection/i.test(message);
}
