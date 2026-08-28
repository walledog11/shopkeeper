import { Worker, type Job } from 'bullmq';
import { QUEUE } from '../../constants.js';
import type { GmailSyncJobData } from '../../types.js';
import { registerJobFailureLogging } from '../failure.js';
import { calculateGmailSyncBackoff } from './backoff.js';
import { processGmailSyncJob } from './process.js';
import type { GmailSyncWorkerRegistrationOptions } from './types.js';

export function createGmailSyncWorker(
  options: GmailSyncWorkerRegistrationOptions,
): Worker<GmailSyncJobData> {
  const worker = new Worker<GmailSyncJobData>(
    QUEUE.GMAIL_SYNC,
    (job: Job<GmailSyncJobData>) => processGmailSyncJob(job.data, options),
    {
      ...options.workerOptions,
      settings: {
        backoffStrategy: (attemptsMade, _type, error) => (
          calculateGmailSyncBackoff(attemptsMade, error)
        ),
      },
    },
  );

  registerJobFailureLogging(worker, {
    logMessage: '[Gmail Sync] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: QUEUE.GMAIL_SYNC,
      integrationId: job?.data?.integrationId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
