import { db } from '@shopkeeper/db';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  FIVE_MINUTES_MS,
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
const SWEEP_ERROR = 'Send did not complete — message was queued but never sent. Retry to resend.';

export async function runOutboundSendSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);

  const { count } = await db.message.updateMany({
    where: { sendStatus: 'pending', sentAt: { lt: cutoff } },
    data: { sendStatus: 'failed', sendError: SWEEP_ERROR },
  });

  if (count > 0) {
    logger.error(
      { opsAlert: true, count },
      '[OutboundSendSweep] Marked orphaned pending sends as failed',
    );
  }
}

export const registerOutboundSendSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.OUTBOUND_SEND_SWEEP);
  await scheduleRepeatableJob(queue, JOB.OUTBOUND_SEND_SWEEP, JOB.OUTBOUND_SEND_SWEEP_ID, FIVE_MINUTES_MS);

  const worker = createMaintenanceWorker(context, QUEUE.OUTBOUND_SEND_SWEEP, runOutboundSendSweep, {
    label: 'OutboundSendSweep',
    failureQueue: 'outbound-send-sweep',
  });

  return { workers: [worker], queues: [queue] };
};
