import type { Redis as IORedis } from 'ioredis';
import { db, type DbChannelType } from '@shopkeeper/db';
import { QUEUE } from '../constants.js';
import { getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { getGatewayRedis } from '../clients/redis-client.js';

export function getMessageQueue() {
  return getGatewayBullMqQueue(QUEUE.INBOUND);
}

export function getOrderReviewQueue() {
  return getGatewayBullMqQueue(QUEUE.ORDER_REVIEW);
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
