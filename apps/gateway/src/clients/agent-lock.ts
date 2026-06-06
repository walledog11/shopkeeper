import crypto from 'node:crypto';
import type { Redis as IORedis } from 'ioredis';
import type { LockProvider, ThreadLock } from '@clerk/agent/lock';
import logger from '../logger.js';

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

// LockProvider seam (Track 4.0): the gateway's ioredis-backed implementation,
// mirroring the dashboard's Upstash provider. Same fail-open posture — a Redis
// outage returns a no-op lock rather than taking the worker's agent down. The
// worker injects this into executeAgentTurn when it runs the core in-process.
export function createGatewayLockProvider(redis: IORedis): LockProvider {
  return {
    async acquire(threadId: string, ttlSeconds = 90): Promise<ThreadLock | null> {
      const key = `agent:lock:${threadId}`;
      const token = crypto.randomUUID();

      let acquired: unknown;
      try {
        acquired = await withTimeout(redis.set(key, token, 'EX', ttlSeconds, 'NX'), ACQUIRE_TIMEOUT_MS);
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
            await redis.eval(RELEASE_SCRIPT, 1, key, token);
          } catch {
            // best-effort; TTL will sweep it
          }
        },
      };
    },
  };
}
