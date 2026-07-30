import { Queue } from 'bullmq';
import {
  GMAIL_SYNC_QUEUE_DEFAULTS,
  PROCESSING_QUEUE_DEFAULTS,
  QUEUE,
} from '../constants.js';
import { getGatewayBullMqProducerConnection } from './redis-client.js';

type GatewayQueueDefaults = typeof PROCESSING_QUEUE_DEFAULTS | typeof GMAIL_SYNC_QUEUE_DEFAULTS;

const DEFAULT_QUEUE_OPTIONS: Partial<Record<string, { defaultJobOptions: GatewayQueueDefaults }>> = {
  [QUEUE.INBOUND]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
  [QUEUE.AI_SUMMARY]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
  [QUEUE.ORDER_REVIEW]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
  [QUEUE.OUTBOUND_EMAIL]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
  [QUEUE.GMAIL_SYNC]: { defaultJobOptions: GMAIL_SYNC_QUEUE_DEFAULTS },
  [QUEUE.OPERATOR_EVENT]: { defaultJobOptions: PROCESSING_QUEUE_DEFAULTS },
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
