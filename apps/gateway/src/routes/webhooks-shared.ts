import type { Redis as IORedis } from 'ioredis';
import type { Queue } from 'bullmq';
import { db, type DbChannelType } from '@shopkeeper/db';
import { QUEUE } from '../constants.js';
import { getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { getGatewayRedis } from '../clients/redis-client.js';
import type { GmailSyncJobData } from '../types.js';

export function getMessageQueue() {
  return getGatewayBullMqQueue(QUEUE.INBOUND);
}

export function getOrderReviewQueue() {
  return getGatewayBullMqQueue(QUEUE.ORDER_REVIEW);
}

export function getGmailSyncQueue() {
  return getGatewayBullMqQueue(QUEUE.GMAIL_SYNC) as Queue<GmailSyncJobData>;
}

export function getRateLimitRedis(): IORedis {
  return getGatewayRedis();
}

export async function resolveOrganizationId(platform: DbChannelType, externalAccountId: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { platform, externalAccountId },
    select: { organizationId: true },
  });
  return integration?.organizationId ?? null;
}
