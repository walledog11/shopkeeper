import type { Redis as IORedis } from 'ioredis';
import type { LockProvider } from '@shopkeeper/agent/lock';
import { createRedisLockProvider, ioredisLockClient } from '@shopkeeper/agent/lock/redis';
import logger from '../logger.js';

// Gateway LockProvider backed by ioredis (dashboard uses Upstash). Default
// acquire fails open; mutating executeAgentTurn calls pass failClosed: true.
export function createGatewayLockProvider(redis: IORedis): LockProvider {
  return createRedisLockProvider(ioredisLockClient(redis), { log: logger });
}
