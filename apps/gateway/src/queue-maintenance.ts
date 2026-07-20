import { getGatewayBullMqQueue, resolveGatewayQueueName } from './clients/gateway-queues.js';

export { resolveGatewayQueueName as resolveQueueName };

export async function removeFailedQueueJob(
  queueName: string,
  jobId: string,
): Promise<boolean> {
  const queue = getGatewayBullMqQueue(queueName);
  const job = await queue.getJob(jobId);
  if (!job) {
    return false;
  }

  // This endpoint/script is housekeeping for retained failure evidence, not a
  // generic queue deletion primitive. Re-check state at mutation time so a
  // stale operator view cannot remove a waiting, active, or completed job.
  if (await job.getState() !== 'failed') {
    return false;
  }

  await job.remove();
  return true;
}
