import type { Redis as IORedis } from 'ioredis';
import { Queue } from 'bullmq';
import { toGatewayBullMqConnection } from './clients/redis-client.js';
import { QUEUE } from './constants.js';

const QUEUE_ALIASES: Record<string, string> = {
  inbound: QUEUE.INBOUND,
  'inbound-messages': QUEUE.INBOUND,
  aiSummary: QUEUE.AI_SUMMARY,
  'ai-summary': QUEUE.AI_SUMMARY,
};

export function resolveQueueName(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('Queue name is required');
  }

  return QUEUE_ALIASES[value] ?? value;
}

export async function removeFailedQueueJob(
  redis: IORedis,
  queueName: string,
  jobId: string,
): Promise<boolean> {
  const queue = new Queue(resolveQueueName(queueName), {
    connection: toGatewayBullMqConnection(redis),
  });

  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    return true;
  } finally {
    await queue.close();
  }
}
