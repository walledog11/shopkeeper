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

export async function enqueueRecoverableIntegrationDisconnects(
  disconnectQueue: Queue<IntegrationDisconnectJobData>,
): Promise<number> {
  const operations = await listRecoverableIntegrationDisconnects();
  let enqueued = 0;
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
