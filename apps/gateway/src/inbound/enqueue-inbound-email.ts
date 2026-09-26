import type { JobsOptions, Queue } from 'bullmq';
import { toInboundEmailJobPayload, type InboundEmailEvent } from '@shopkeeper/email';
import { JOB } from '../constants.js';

export type EnqueueInboundEmailOptions = Pick<JobsOptions, 'jobId'>;

/** Sole producer of process-email jobs from normalized ingress events. */
export async function enqueueInboundEmail(
  queue: Queue,
  event: InboundEmailEvent,
  options: EnqueueInboundEmailOptions = {},
): Promise<void> {
  const jobOptions = options.jobId ? { jobId: options.jobId } : undefined;
  await queue.add(JOB.EMAIL, toInboundEmailJobPayload(event), jobOptions);
}
