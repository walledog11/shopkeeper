import { Queue } from 'bullmq';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import { getGatewayBullMqProducerConnection } from './redis-client.js';

const DEFAULT_QUEUE_OPTIONS: Partial<Record<string, { defaultJobOptions: typeof PROCESSING_QUEUE_DEFAULTS }>> = {
  [QUEUE.INBOUND]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
  [QUEUE.ORDER_REVIEW]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
};

const QUEUE_ALIASES: Record<string, string> = {
  inbound: QUEUE.INBOUND,
  'inbound-messages': QUEUE.INBOUND,
  aiSummary: QUEUE.AI_SUMMARY,
  'ai-summary': QUEUE.AI_SUMMARY,
};

const queueCache = new Map<string, Queue>();

export function resolveGatewayQueueName(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('Queue name is required');
  }

  return QUEUE_ALIASES[value] ?? value;
}

export function getGatewayBullMqQueue(rawQueueName: string): Queue {
  const queueName = resolveGatewayQueueName(rawQueueName);
  let queue = queueCache.get(queueName);
  if (!queue) {
    queue = new Queue(queueName, {
      connection: getGatewayBullMqProducerConnection(),
      ...(DEFAULT_QUEUE_OPTIONS[queueName] ?? {}),
    });
    queueCache.set(queueName, queue);
  }

  return queue;
}

export async function closeGatewayBullMqQueues(): Promise<void> {
  const queues = [...queueCache.values()];
  queueCache.clear();
  await Promise.all(queues.map((queue) => queue.close()));
}

export function resetGatewayBullMqQueuesForTests(): void {
  queueCache.clear();
}
