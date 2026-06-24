import type { LockAcquireOptions, LockProvider, ThreadLock } from '@shopkeeper/agent/lock';
import {
  createRedisLockProvider,
  ioredisLockClient,
  upstashRedisLockClient,
} from '@shopkeeper/agent/lock/redis';
import { Redis as IORedis } from 'ioredis';
import { getRedis } from './redis';
import logger from './logger';

// The browser E2E server (E2E_SERVER=true) backs the lock with the local
// ioredis at REDIS_URL because the Upstash REST URL is a placeholder under
// test — mirrors the rate limiter's E2E Redis seam.
let e2eLockRedis: IORedis | null = null;

function getE2ELockClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (!e2eLockRedis) {
    e2eLockRedis = new IORedis(redisUrl);
    e2eLockRedis.on('error', () => undefined);
  }
  return ioredisLockClient(e2eLockRedis);
}

// Default acquire fails open for read-only paths. Mutating agent turns pass
// `failClosed: true` from executeAgentTurn so Redis outages block refunds,
// cancellations, and outbound replies instead of running without a mutex.
export const upstashLockProvider: LockProvider = createRedisLockProvider(
  {
    getClient() {
      try {
        if (process.env.E2E_SERVER === 'true') {
          return getE2ELockClient();
        }
        return upstashRedisLockClient(getRedis());
      } catch {
        return null;
      }
    },
  },
  { log: logger },
);

export async function acquireThreadLock(
  threadId: string,
  options?: number | LockAcquireOptions,
): Promise<ThreadLock | null> {
  const resolved = typeof options === 'number' ? { ttlSeconds: options } : options;
  return upstashLockProvider.acquire(threadId, resolved);
}
