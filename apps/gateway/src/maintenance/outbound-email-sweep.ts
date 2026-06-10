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

// A healthy outbound send resolves to `sent` or `failed` within seconds (the
// queue's retry window is ~15s). Anything still `pending` past this is orphaned:
// the row was created but the enqueue or its job never completed (enqueue-after-
// row-create is not atomic). Mark it `failed` so the composer's retry affordance
// can re-send it — recovery without reconstructing integration/source state or
// risking a double-send against a still-live job.
const STALE_PENDING_MS = 10 * 60 * 1000;
const SWEEP_ERROR = 'Send did not complete — message was queued but never sent. Retry to resend.';

export async function runOutboundEmailSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS);

  const { count } = await db.message.updateMany({
    where: { sendStatus: 'pending', sentAt: { lt: cutoff } },
    data: { sendStatus: 'failed', sendError: SWEEP_ERROR },
  });

  if (count > 0) {
    logger.error(
      { opsAlert: true, count },
      '[OutboundEmailSweep] Marked orphaned pending sends as failed',
    );
  }
}

export const registerOutboundEmailSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.OUTBOUND_EMAIL_SWEEP);
  await scheduleRepeatableJob(queue, JOB.OUTBOUND_EMAIL_SWEEP, JOB.OUTBOUND_EMAIL_SWEEP_ID, FIVE_MINUTES_MS);

  const worker = createMaintenanceWorker(context, QUEUE.OUTBOUND_EMAIL_SWEEP, runOutboundEmailSweep, {
    label: 'OutboundEmailSweep',
    failureQueue: 'outbound-email-sweep',
  });

  return { workers: [worker], queues: [queue] };
};
