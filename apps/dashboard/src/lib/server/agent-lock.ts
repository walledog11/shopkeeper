import type { LockProvider, ThreadLock } from '@shopkeeper/agent/lock';
import {
  createRedisLockProvider,
  upstashRedisLockClient,
} from '@shopkeeper/agent/lock/redis';
import { getRedis } from './redis';
import logger from './logger';

// Fails open: if Redis is unreachable or test env points at a fake host, return a no-op lock so
// the agent stays functional. A Redis outage shouldn't take the agent down , the mutex is a soft
// mitigation against same-thread races, not a hard guarantee.
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

export async function acquireThreadLock(threadId: string, ttlSeconds = 90): Promise<ThreadLock | null> {
  return upstashLockProvider.acquire(threadId, ttlSeconds);
}
