import { listRecoverableIntegrationDisconnects } from '@shopkeeper/db';
import type { Queue } from 'bullmq';
import { INTEGRATION_DISCONNECT_QUEUE_DEFAULTS, JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import type { IntegrationDisconnectJobData } from '../types.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const SWEEP_INTERVAL_MS = 60 * 1000;
const RECOVERY_PAGE_SIZE = 100;

export async function enqueueRecoverableIntegrationDisconnects(
  disconnectQueue: Queue<IntegrationDisconnectJobData>,
): Promise<number> {
  // Bound each sweep to the recoverable set visible at its start so a steady
  // stream of new disconnects cannot make one sweep unbounded. Keyset paging
  // still visits every row in that snapshot, including backlogs above one page.
  const createdBefore = new Date();
  let after: { createdAt: Date; id: string } | undefined;
  let enqueued = 0;
  do {
    const operations = await listRecoverableIntegrationDisconnects({
      after,
      createdBefore,
      limit: RECOVERY_PAGE_SIZE,
    });
    for (const operation of operations) {
      const existing = await disconnectQueue.getJob(operation.id);
      if (existing) {
        const state = await existing.getState();
        if (state === 'failed' || state === 'completed') {
          await existing.remove();
        } else {
          continue;
        }
      }
      await disconnectQueue.add(
        JOB.INTEGRATION_DISCONNECT,
        { operationId: operation.id, organizationId: operation.organizationId },
        { jobId: operation.id },
      );
      enqueued += 1;
    }

    const last = operations.at(-1);
    after = operations.length === RECOVERY_PAGE_SIZE && last
      ? { createdAt: last.createdAt, id: last.id }
      : undefined;
  } while (after);
  return enqueued;
}

export const registerIntegrationDisconnectSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const sweepQueue = createMaintenanceQueue(context, QUEUE.INTEGRATION_DISCONNECT_SWEEP);
  const disconnectQueue = createMaintenanceQueue<IntegrationDisconnectJobData>(
    context,
    QUEUE.INTEGRATION_DISCONNECT,
    { defaultJobOptions: INTEGRATION_DISCONNECT_QUEUE_DEFAULTS },
  );
  await scheduleRepeatableJob(
    sweepQueue,
    JOB.INTEGRATION_DISCONNECT_SWEEP,
    JOB.INTEGRATION_DISCONNECT_SWEEP_ID,
    SWEEP_INTERVAL_MS,
  );

  const worker = createMaintenanceWorker(
    context,
    QUEUE.INTEGRATION_DISCONNECT_SWEEP,
    async () => {
      const enqueued = await enqueueRecoverableIntegrationDisconnects(disconnectQueue);
      if (enqueued > 0) {
        logger.info(
          { count: enqueued },
          '[IntegrationDisconnectSweep] Re-enqueued recoverable operations',
        );
      }
    },
    { label: 'IntegrationDisconnectSweep', failureQueue: QUEUE.INTEGRATION_DISCONNECT_SWEEP },
  );

  return { workers: [worker], queues: [sweepQueue, disconnectQueue] };
};
