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

  await job.remove();
  return true;
}
