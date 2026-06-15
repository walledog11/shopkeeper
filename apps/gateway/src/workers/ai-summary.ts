import { Worker } from 'bullmq';
import { QUEUE } from '../constants.js';
import { processAiSummaryJob } from '../message-handlers/ai-summary-flow.js';
import type { AiSummaryJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export function createAiSummaryWorker(workerOptions: SharedGatewayWorkerOptions): Worker<AiSummaryJobData> {
  const worker = new Worker<AiSummaryJobData>(QUEUE.AI_SUMMARY, async (job) => {
    await processAiSummaryJob(job.data);
  }, workerOptions);

  registerJobFailureLogging(worker, {
    logMessage: '[AISummary] Job failed',
    logFields: (job) => ({ jobId: job?.id, threadId: job?.data?.threadId }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'aiSummary',
      threadId: job?.data?.threadId,
      organizationId: job?.data?.organizationId,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
