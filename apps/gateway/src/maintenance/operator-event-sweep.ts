import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  findCommittedUndeliveredOperatorEvents,
  markOperatorEventReplyDelivered,
  reconcileStaleClaimedOperatorEvents,
} from '../operator-event-store.js';
import { sendOperatorEventReply } from '../operator-event-reply.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Recovery backstop for durable operator events (P4-03). Free-form operator
// turns carry no plan claim, so a claim is their only single-use guard: a worker
// that died mid-turn leaves a `claimed` row that is never auto-replayed. This
// sweep is that row's only recovery. It is channel-agnostic — the claimed ->
// unknown reconciliation is pure status; only the confirmation re-send dispatches
// per channel (which also closes Telegram's undelivered-reply recovery).

// Well above the worker stall interval (prod 300s) and any realistic operator
// turn duration, so the sweep never reconciles a claim a live worker still holds.
const STALE_CLAIMED_MS = 10 * 60 * 1000;
// A committed row whose confirmation never reached the provider is re-sent once
// it is older than this, keeping the sweep clear of the worker's own
// commit -> mark-delivered window so a just-committed reply is not double-sent.
const UNDELIVERED_MS = 5 * 60 * 1000;
const RESEND_BATCH = 50;
// Kept above the DB autosuspend window so compute can scale to zero between runs.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const STALE_CLAIM_ERROR =
  'Operator turn did not finish; claim reconciled to unknown for review. It is never auto-replayed.';

export async function runOperatorEventSweep(): Promise<void> {
  const now = Date.now();

  const reconciledUnknown = await reconcileStaleClaimedOperatorEvents(
    new Date(now - STALE_CLAIMED_MS),
    STALE_CLAIM_ERROR,
  );

  const undelivered = await findCommittedUndeliveredOperatorEvents(
    new Date(now - UNDELIVERED_MS),
    RESEND_BATCH,
  );

  let redelivered = 0;
  for (const event of undelivered) {
    if (!event.replyText) continue;
    try {
      if (await sendOperatorEventReply(event, event.replyText)) {
        await markOperatorEventReplyDelivered(event.id);
        redelivered += 1;
      }
    } catch (err) {
      logger.warn(
        { err, operatorEventId: event.id },
        '[OperatorEventSweep] Re-send failed; will retry next sweep',
      );
    }
  }

  const unhealedUndelivered = undelivered.length - redelivered;
  if (reconciledUnknown > 0 || unhealedUndelivered > 0) {
    logger.error(
      { opsAlert: true, reconciledUnknown, undeliveredFound: undelivered.length, redelivered },
      '[OperatorEventSweep] Reconciled stuck operator events',
    );
  } else if (redelivered > 0) {
    logger.info(
      { redelivered },
      '[OperatorEventSweep] Re-sent committed operator replies',
    );
  }
}

export const registerOperatorEventSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.OPERATOR_EVENT_SWEEP);
  await scheduleRepeatableJob(
    queue,
    JOB.OPERATOR_EVENT_SWEEP,
    JOB.OPERATOR_EVENT_SWEEP_ID,
    SWEEP_INTERVAL_MS,
  );

  const worker = createMaintenanceWorker(context, QUEUE.OPERATOR_EVENT_SWEEP, runOperatorEventSweep, {
    label: 'OperatorEventSweep',
    failureQueue: 'operator-event-sweep',
  });

  return { workers: [worker], queues: [queue] };
};
