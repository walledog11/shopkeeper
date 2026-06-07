import type { Redis as IORedis } from 'ioredis';
import type { LockProvider } from '@shopkeeper/agent/lock';
import { createRedisLockProvider, ioredisLockClient } from '@shopkeeper/agent/lock/redis';
import logger from '../logger.js';

// LockProvider seam (Track 4.0): the gateway's ioredis-backed implementation,
// mirroring the dashboard's Upstash provider. Same fail-open posture — a Redis
// outage returns a no-op lock rather than taking the worker's agent down. The
// worker injects this into executeAgentTurn when it runs the core in-process.
export function createGatewayLockProvider(redis: IORedis): LockProvider {
  return createRedisLockProvider(ioredisLockClient(redis), { log: logger });
}
