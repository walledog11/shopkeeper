import { Queue, type ConnectionOptions } from 'bullmq';
import type { Redis as IORedis } from 'ioredis';
import { db, type DbChannelType } from '@clerk/db';
import logger from '../logger.js';
import { QUEUE } from '../constants.js';
import { createGatewayRedisClient } from '../clients/redis-client.js';

let _messageQueue: Queue | null = null;
export function getMessageQueue(): Queue {
  if (!_messageQueue) {
    const redisConnection = createGatewayRedisClient() as unknown as ConnectionOptions;
    _messageQueue = new Queue(QUEUE.INBOUND, { connection: redisConnection });
  }
  return _messageQueue;
}

let _rateLimitRedis: IORedis | null = null;
export function getRateLimitRedis(): IORedis {
  if (!_rateLimitRedis) {
    _rateLimitRedis = createGatewayRedisClient();
    _rateLimitRedis.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[Webhook] Rate-limit Redis error');
    });
  }
  return _rateLimitRedis;
}

export async function resolveOrganizationId(platform: DbChannelType, externalAccountId: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { platform, externalAccountId },
    select: { organizationId: true },
  });
  return integration?.organizationId ?? null;
}