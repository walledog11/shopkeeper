import crypto from 'node:crypto';
import type { LockProvider, ThreadLock } from '@clerk/agent/lock';
import { getRedis } from './redis';
import logger from './logger';

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const ACQUIRE_TIMEOUT_MS = 1000;
const NOOP_LOCK: ThreadLock = { release: async () => {} };

const TIMED_OUT = Symbol('timed-out');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Fails open: if Redis is unreachable or test env points at a fake host, return a no-op lock so
// the agent stays functional. A Redis outage shouldn't take the agent down , the mutex is a soft
// mitigation against same-thread races, not a hard guarantee.
export async function acquireThreadLock(threadId: string, ttlSeconds = 90): Promise<ThreadLock | null> {
  const key = `agent:lock:${threadId}`;
  const token = crypto.randomUUID();

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    logger.warn({ err: (err as Error).message, threadId }, '[agent-lock] redis unavailable; proceeding without lock');
    return NOOP_LOCK;
  }

  let acquired: unknown;
  try {
    acquired = await withTimeout(redis.set(key, token, { nx: true, ex: ttlSeconds }), ACQUIRE_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ err: (err as Error).message, threadId }, '[agent-lock] redis set failed; proceeding without lock');
    return NOOP_LOCK;
  }

  if (acquired === TIMED_OUT) {
    logger.warn({ threadId, timeoutMs: ACQUIRE_TIMEOUT_MS }, '[agent-lock] redis set timed out; proceeding without lock');
    return NOOP_LOCK;
  }

  if (acquired !== 'OK') return null;
  return {
    async release() {
      try {
        await redis.eval(RELEASE_SCRIPT, [key], [token]);
      } catch {
        // best-effort; TTL will sweep it
      }
    },
  };
}

// LockProvider seam (Track 4.0): the dashboard's Upstash-backed implementation,
// injected into executeAgentTurn so the package core stays Redis-agnostic.
export const upstashLockProvider: LockProvider = {
  acquire: (threadId, ttlSeconds) => acquireThreadLock(threadId, ttlSeconds),
};
