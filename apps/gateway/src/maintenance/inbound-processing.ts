import type { AiSummaryJobData } from '../types.js';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import { recoverInboundProcessing } from '../message-handlers/inbound/inbound-processing.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const RECOVERY_QUEUE = 'inbound-processing-recovery';

export const registerInboundProcessingMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, RECOVERY_QUEUE);
  const summaryQueue = createMaintenanceQueue<AiSummaryJobData>(context, QUEUE.AI_SUMMARY, {
    defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
  });
  await scheduleRepeatableJob(queue, 'recover-inbound-processing', 'recover-inbound-processing', 60_000);
  const worker = createMaintenanceWorker(
    context, RECOVERY_QUEUE,
    () => recoverInboundProcessing(summaryQueue),
    { label: 'InboundProcessing', failureQueue: RECOVERY_QUEUE },
  );
  return { workers: [worker], queues: [queue, summaryQueue] };
};
