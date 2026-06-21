import { Worker } from 'bullmq';
import { QUEUE } from '../constants.js';
import type { OutboundImessageJobData } from '../types.js';
import { handleOutboundImessageJob } from '../message-handlers/outbound-imessage.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface OutboundImessageWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

// Async outbound iMessage send queue, mirroring the outbound-email worker:
// transient gRPC failures retry (3x backoff) instead of failing the caller's
// HTTP request. The message row carries sendStatus.
export function createOutboundImessageWorker(
  options: OutboundImessageWorkerRegistrationOptions,
): Worker<OutboundImessageJobData> {
  const worker = new Worker<OutboundImessageJobData>(
    QUEUE.OUTBOUND_IMESSAGE,
    handleOutboundImessageJob,
    options.workerOptions,
  );

  registerJobFailureLogging(worker, {
    logMessage: '[OutboundImessage] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'outbound-imessage',
      organizationId: job?.data?.organizationId,
      messageId: job?.data?.messageId,
      source: job?.data?.source,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
