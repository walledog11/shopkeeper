import crypto from 'node:crypto';
import { ServiceUnavailableError } from '../errors.js';
import type { LockAcquireOptions, LockProvider, ThreadLock } from './index.js';

export const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
export const RENEW_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end';
export const ACQUIRE_TIMEOUT_MS = 1000;
export const RENEW_TIMEOUT_MS = 1000;
export const NOOP_LOCK: ThreadLock = { release: async () => {}, isLost: () => false };

const TIMED_OUT = Symbol('timed-out');

export interface RedisLockLogger {
  warn(meta: Record<string, unknown>, message: string): void;
}

export interface RedisLockClient {
  setNxEx(key: string, token: string, ttlSeconds: number): Promise<unknown>;
  evalRelease(key: string, token: string): Promise<unknown>;
  evalRenew(key: string, token: string, ttlSeconds: number): Promise<unknown>;
}

export interface RedisLockClientSource {
  getClient(): RedisLockClient | null;
}

export interface RedisLockProviderOptions {
  log?: RedisLockLogger;
  renewIntervalMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resolveClient(source: RedisLockClient | RedisLockClientSource): RedisLockClient | null {
  return 'getClient' in source ? source.getClient() : source;
}

function resolveLockUnavailable(
  options: RedisLockProviderOptions | undefined,
  meta: Record<string, unknown>,
  message: string,
  failClosed: boolean,
): ThreadLock {
  options?.log?.warn(meta, message);
  if (failClosed) {
    throw new ServiceUnavailableError(
      'Agent lock unavailable. Mutating agent runs are blocked until locking is restored.',
    );
  }
  return NOOP_LOCK;
}

export function createRedisLockProvider(
  source: RedisLockClient | RedisLockClientSource,
  options?: RedisLockProviderOptions,
): LockProvider {
  return {
    async acquire(threadId: string, acquireOptions: LockAcquireOptions = {}): Promise<ThreadLock | null> {
      const ttlSeconds = acquireOptions.ttlSeconds ?? 90;
      const failClosed = acquireOptions.failClosed ?? false;
      const key = `agent:lock:${threadId}`;
      const token = crypto.randomUUID();
      const client = resolveClient(source);

      if (!client) {
        return resolveLockUnavailable(
          options,
          { threadId },
          failClosed
            ? '[agent-lock] redis unavailable; refusing mutating agent turn without lock'
            : '[agent-lock] redis unavailable; proceeding without lock',
          failClosed,
        );
      }

      let acquired: unknown;
      try {
        acquired = await withTimeout(client.setNxEx(key, token, ttlSeconds), ACQUIRE_TIMEOUT_MS);
      } catch (err) {
        return resolveLockUnavailable(
          options,
          { err: (err as Error).message, threadId },
          failClosed
            ? '[agent-lock] redis set failed; refusing mutating agent turn without lock'
            : '[agent-lock] redis set failed; proceeding without lock',
          failClosed,
        );
      }

      if (acquired === TIMED_OUT) {
        return resolveLockUnavailable(
          options,
          { threadId, timeoutMs: ACQUIRE_TIMEOUT_MS },
          failClosed
            ? '[agent-lock] redis set timed out; refusing mutating agent turn without lock'
            : '[agent-lock] redis set timed out; proceeding without lock',
          failClosed,
        );
      }

      if (acquired !== 'OK') return null;
      let released = false;
      let lost = false;
      let renewing = false;
      const renewIntervalMs = options?.renewIntervalMs
        ?? Math.max(250, Math.floor(ttlSeconds * 1000 / 3));
      const renewalTimer = setInterval(async () => {
        if (released || lost || renewing) return;
        renewing = true;
        try {
          const renewed = await withTimeout(
            client.evalRenew(key, token, ttlSeconds),
            RENEW_TIMEOUT_MS,
          );
          if (renewed !== 1) {
            lost = true;
            clearInterval(renewalTimer);
            options?.log?.warn(
              {
                threadId,
                timeoutMs: renewed === TIMED_OUT ? RENEW_TIMEOUT_MS : undefined,
              },
              renewed === TIMED_OUT
                ? '[agent-lock] lease renewal timed out; lock ownership is unknown'
                : '[agent-lock] lease renewal lost; another caller may hold the latency guard',
            );
          }
        } catch (err) {
          lost = true;
          clearInterval(renewalTimer);
          options?.log?.warn(
            { err: (err as Error).message, threadId },
            '[agent-lock] lease renewal failed; lock ownership is unknown',
          );
        } finally {
          renewing = false;
        }
      }, renewIntervalMs);
      renewalTimer.unref?.();

      return {
        isLost: () => lost,
        async release() {
          if (released) return;
          released = true;
          clearInterval(renewalTimer);
          try {
            await client.evalRelease(key, token);
          } catch {
            // best-effort; TTL will sweep it
          }
        },
      };
    },
  };
}

export function upstashRedisLockClient(redis: {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}): RedisLockClient {
  return {
    setNxEx: (key, token, ttlSeconds) => redis.set(key, token, { nx: true, ex: ttlSeconds }),
    evalRelease: (key, token) => redis.eval(RELEASE_SCRIPT, [key], [token]),
    evalRenew: (key, token, ttlSeconds) => redis.eval(RENEW_SCRIPT, [key], [token, String(ttlSeconds)]),
  };
}

export function ioredisLockClient(redis: {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    ttlSeconds: number,
    setMode: 'NX',
  ): Promise<unknown>;
  eval(script: string, numKeys: number, key: string, ...args: Array<string | number>): Promise<unknown>;
}): RedisLockClient {
  return {
    setNxEx: (key, token, ttlSeconds) => redis.set(key, token, 'EX', ttlSeconds, 'NX'),
    evalRelease: (key, token) => redis.eval(RELEASE_SCRIPT, 1, key, token),
    evalRenew: (key, token, ttlSeconds) => redis.eval(RENEW_SCRIPT, 1, key, token, ttlSeconds),
  };
}
