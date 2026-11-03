import { Worker } from 'bullmq';
import { recordStepTiming } from '@shopkeeper/agent/step-timings';
import { QUEUE } from '../constants.js';
import { isModelProviderError } from '@shopkeeper/agent/ai';
import { processAiSummaryJob } from '../message-handlers/inbound/ai-summary-flow.js';
import { noteModelRecovered, waitOutModelOutage } from '../message-handlers/inbound/model-outage.js';
import type { AiSummaryJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export function createAiSummaryWorker(workerOptions: SharedGatewayWorkerOptions): Worker<AiSummaryJobData> {
  const worker = new Worker<AiSummaryJobData>(QUEUE.AI_SUMMARY, async (job, token) => {
    // Includes the short debounce that lets a burst of messages land together.
    // Timed once: a message held through an outage is not re-timed every retry.
    if (job.data.modelOutageSince === undefined) {
      await recordStepTiming({
        organizationId: job.data.organizationId,
        threadId: job.data.threadId,
        step: 'read_queue_wait',
        startedAt: new Date(job.timestamp),
        durationMs: Date.now() - job.timestamp,
      });
    }
    try {
      await processAiSummaryJob(job.data);
    } catch (error) {
      if (!isModelProviderError(error)) throw error;
      await waitOutModelOutage(job, token, error);
    }
    await noteModelRecovered(job.data.organizationId);
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
