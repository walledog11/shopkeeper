import { db } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Channel-agnostic reconciler for stale `pending` outbound rows. Async outbound
// (email and iMessage) pre-creates a `pending` Message, then a gateway worker
// flips it `sent`/`failed` within seconds (the queue's retry window is ~15s).
// Neither channel has a per-message delivery webhook to reconcile against, so
// anything still `pending` past this window is orphaned: the row was created but
// the enqueue or its job never completed (enqueue-after-row-create is not
// atomic). Mark it `failed` so the composer's retry affordance can re-send it —
// recovery without reconstructing integration/source state or risking a
// double-send against a still-live job. The query intentionally has no channel
// filter so every async outbound channel is covered by this one job.
const STALE_PENDING_MS = 10 * 60 * 1000;
// Kept well above the DB's autosuspend window so the compute can scale to zero
// between runs; this is a backstop, not the primary send path.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_ERROR = 'Send did not complete — message was queued but never sent. Retry to resend.';

export async function runOutboundSendSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);

  const { count } = await retryAfterDbReconnect(() => db.message.updateMany({
    where: { sendStatus: 'pending', sentAt: { lt: cutoff } },
    data: { sendStatus: 'failed', sendError: SWEEP_ERROR },
  }));

  if (count > 0) {
    logger.error(
      { opsAlert: true, count },
      '[OutboundSendSweep] Marked orphaned pending sends as failed',
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
