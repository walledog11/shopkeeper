import { getGatewayBullMqQueue } from './clients/gateway-queues.js';
import { JOB, QUEUE } from './constants.js';
import {
  ingestOperatorEvent,
  type IngestOperatorEventParams,
  type IngestOperatorEventResult,
} from './operator-event-store.js';
import type { OperatorEventJobData } from './types.js';

// Shared durable-ingestion entry point for every operator channel (P4-03): the
// webhook persists an OperatorEvent, ensures a live job exists, then acknowledges.
// Telegram and iMessage both call this so the subtle enqueue-healing below lives
// in one place.

// Ensure a live job exists for a persisted event. Always attempted (even on a
// redelivery whose row already existed) so a `pending` row can never be stranded
// without a job when a prior enqueue failed: `add` with jobId=event.id is a no-op
// for a still-live job, and a retained terminal job is replaced. Mirrors the
// outbound-email enqueue in internal-queue.ts.
export async function ensureOperatorEventEnqueued(event: { id: string; organizationId: string }): Promise<void> {
  const queue = getGatewayBullMqQueue(QUEUE.OPERATOR_EVENT);
  const jobData: OperatorEventJobData = { operatorEventId: event.id, organizationId: event.organizationId };
  const existing = await queue.getJob(event.id);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed' || state === 'completed') {
      await existing.remove();
      await queue.add(JOB.OPERATOR_EVENT, jobData, { jobId: event.id });
    }
    return;
  }
  await queue.add(JOB.OPERATOR_EVENT, jobData, { jobId: event.id });
}

// Persist one inbound operator message and ensure it is enqueued. Idempotent on
// (channel, providerMessageId): a provider redelivery returns created=false but
// still re-runs the enqueue so a row whose first enqueue failed is not stranded.
export async function ingestAndEnqueueOperatorEvent(
  params: IngestOperatorEventParams,
): Promise<IngestOperatorEventResult> {
  const result = await ingestOperatorEvent(params);
  await ensureOperatorEventEnqueued(result.event);
  return result;
}
