import {
  listOpenFollowUpWatchCandidates,
  markFollowUpWatchNotified,
  markFollowUpWatchSkipped,
} from '@shopkeeper/db';
import logger from '../logger.js';
import { JOB, QUEUE } from '../constants.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';
import { isPostResolutionFollowUpMonitorEnabled } from '../config/runtime-config.js';
import {
  isOrgPostResolutionFollowUpEnabled,
  resolveFollowUpDays,
} from './post-resolution-followup-config.js';
import { pushFollowUpNudge } from './post-resolution-followup-plan.js';

export { postResolutionFollowUpIdempotencyKey } from './post-resolution-followup-plan.js';

const CANDIDATE_LIMIT = 200;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export async function runPostResolutionFollowUpMonitor(): Promise<{
  orgsScanned: number;
  watchesChecked: number;
  nudgesSent: number;
}> {
  if (!isPostResolutionFollowUpMonitorEnabled()) {
    return { orgsScanned: 0, watchesChecked: 0, nudgesSent: 0 };
  }

  const candidates = await listOpenFollowUpWatchCandidates(CANDIDATE_LIMIT);
  const now = Date.now();
  const orgsScanned = new Set<string>();
  let watchesChecked = 0;
  let nudgesSent = 0;

  for (const watch of candidates) {
    // Org opted out (while the global flag is on): retire the watch so it stops
    // re-appearing at the front of the oldest-first candidate window.
    if (!isOrgPostResolutionFollowUpEnabled(watch.settings)) {
      await markFollowUpWatchSkipped(watch.id, watch.organizationId);
      continue;
    }
    orgsScanned.add(watch.organizationId);

    const ageMs = now - watch.createdAt.getTime();
    const windowMs = resolveFollowUpDays(watch.settings) * ONE_DAY_MS;
    if (ageMs < windowMs) continue; // not due yet — leave open for a later sweep

    watchesChecked += 1;
    const daysAgo = Math.floor(ageMs / ONE_DAY_MS);
    const outcome = await pushFollowUpNudge(watch.organizationId, {
      id: watch.id,
      orderId: watch.orderId,
      kind: watch.kind,
      customerName: watch.customerName,
      daysAgo,
    });

    if (outcome === 'notified') {
      const marked = await markFollowUpWatchNotified(watch.id, watch.organizationId);
      if (marked) {
        nudgesSent += 1;
        logger.info(
          { organizationId: watch.organizationId, orderId: watch.orderId, kind: watch.kind, watchId: watch.id },
          '[PostResolutionFollowUpMonitor] sent follow-up nudge',
        );
      } else {
        logger.info(
          { organizationId: watch.organizationId, watchId: watch.id },
          '[PostResolutionFollowUpMonitor] watch already handled on another worker',
        );
      }
    } else {
      // No bound operators: nothing to nudge. Retire so it does not accumulate.
      await markFollowUpWatchSkipped(watch.id, watch.organizationId);
    }
  }

  return { orgsScanned: orgsScanned.size, watchesChecked, nudgesSent };
}

export const registerPostResolutionFollowupMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.POST_RESOLUTION_FOLLOWUP);
  await scheduleRepeatableJob(
    queue,
    JOB.POST_RESOLUTION_FOLLOWUP_SCAN,
    JOB.POST_RESOLUTION_FOLLOWUP_ID,
    ONE_HOUR_MS,
  );

  const worker = createMaintenanceWorker(
    context,
    QUEUE.POST_RESOLUTION_FOLLOWUP,
    runPostResolutionFollowUpMonitor,
    {
      label: 'PostResolutionFollowUp',
      failureQueue: QUEUE.POST_RESOLUTION_FOLLOWUP,
    },
  );

  return { workers: [worker], queues: [queue] };
};
