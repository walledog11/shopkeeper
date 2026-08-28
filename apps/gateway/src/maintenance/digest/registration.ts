import { JOB, QUEUE } from '../../constants.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from '../registration.js';
import { sendScheduledDigests } from './send.js';

export const registerDigestMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.DIGEST);
  await scheduleRepeatableJob(queue, JOB.DIGEST, JOB.DIGEST_ID, ONE_HOUR_MS);

  const worker = createMaintenanceWorker(context, QUEUE.DIGEST, () => sendScheduledDigests(), {
    label: 'Digest',
    failureQueue: QUEUE.DIGEST,
  });

  return { workers: [worker], queues: [queue] };
};
