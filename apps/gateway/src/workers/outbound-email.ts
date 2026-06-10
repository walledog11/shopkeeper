import { Worker } from 'bullmq';
import { QUEUE } from '../constants.js';
import type { OutboundEmailJobData } from '../types.js';
import { handleOutboundEmailJob } from '../message-handlers/outbound-email.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface OutboundEmailWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

// Phase 1.5: async outbound email send queue. Closes the inbound/outbound
// reliability gap — transient provider failures retry (3x backoff) instead of
// failing the caller's HTTP request. The message row carries sendStatus.
export function createOutboundEmailWorker(
  options: OutboundEmailWorkerRegistrationOptions,
): Worker<OutboundEmailJobData> {
  const worker = new Worker<OutboundEmailJobData>(
    QUEUE.OUTBOUND_EMAIL,
    handleOutboundEmailJob,
    options.workerOptions,
  );

  registerJobFailureLogging(worker, {
    logMessage: '[OutboundEmail] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: 'outbound-email',
      organizationId: job?.data?.organizationId,
      messageId: job?.data?.messageId,
      source: job?.data?.source,
      traceId: job?.data?.traceId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
