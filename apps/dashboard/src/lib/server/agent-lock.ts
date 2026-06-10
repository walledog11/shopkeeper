import type { LockAcquireOptions, LockProvider, ThreadLock } from '@shopkeeper/agent/lock';
import {
  createRedisLockProvider,
  upstashRedisLockClient,
} from '@shopkeeper/agent/lock/redis';
import { getRedis } from './redis';
import logger from './logger';

// Default acquire fails open for read-only paths. Mutating agent turns pass
// `failClosed: true` from executeAgentTurn so Redis outages block refunds,
// cancellations, and outbound replies instead of running without a mutex.
export const upstashLockProvider: LockProvider = createRedisLockProvider(
  {
    getClient() {
      try {
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
