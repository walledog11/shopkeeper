import type { Redis as IORedis } from 'ioredis';
import type { LockProvider } from '@shopkeeper/agent/lock';
import { createRedisLockProvider, ioredisLockClient } from '@shopkeeper/agent/lock/redis';
import logger from '../logger.js';

// Gateway LockProvider backed by ioredis (dashboard uses Upstash). Fail-open:
// Redis outage yields a no-op lock so agent turns degrade instead of crashing
// the worker.
export function createGatewayLockProvider(redis: IORedis): LockProvider {
  return createRedisLockProvider(ioredisLockClient(redis), { log: logger });
}
