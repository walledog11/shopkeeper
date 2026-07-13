import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRedisLockProvider,
  ioredisLockClient,
  upstashRedisLockClient,
} from './redis-lock.js';

function makeFakeUpstashRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
      const [key] = keys;
      const [token] = args;
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  };
}

function makeFakeIoredis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, ...args: Array<string | number>) => {
      const nx = args.includes('NX');
      if (nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  };
}

describe('createRedisLockProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('acquires and releases with an Upstash client', async () => {
    const fake = makeFakeUpstashRedis();
    const provider = createRedisLockProvider(upstashRedisLockClient(fake));

    const lock = await provider.acquire('thread-a');
    expect(lock).not.toBeNull();
    expect(fake.store.has('agent:lock:thread-a')).toBe(true);
    await lock!.release();
    expect(fake.store.has('agent:lock:thread-a')).toBe(false);
  });

  it('acquires and releases with an ioredis client', async () => {
    const fake = makeFakeIoredis();
    const provider = createRedisLockProvider(ioredisLockClient(fake));

    const lock = await provider.acquire('thread-b');
    expect(lock).not.toBeNull();
    expect(fake.store.has('agent:lock:thread-b')).toBe(true);
    await lock!.release();
    expect(fake.store.has('agent:lock:thread-b')).toBe(false);
  });

  it('returns null when the lock is already held', async () => {
    const fake = makeFakeUpstashRedis();
    const provider = createRedisLockProvider(upstashRedisLockClient(fake));

    const first = await provider.acquire('thread-c');
    const second = await provider.acquire('thread-c');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('reproduces overlapping ownership after the fixed lease expires', async () => {
    const fake = makeFakeUpstashRedis();
    const provider = createRedisLockProvider(upstashRedisLockClient(fake));

    const first = await provider.acquire('thread-expiry', { ttlSeconds: 1 });
    expect(first).not.toBeNull();

    // Deterministically model Redis TTL expiry while the first caller is still
    // doing provider work. There is no renewal, so another caller can enter.
    fake.store.delete('agent:lock:thread-expiry');
    const second = await provider.acquire('thread-expiry', { ttlSeconds: 1 });

    expect(second).not.toBeNull();
    await first!.release();
    expect(fake.store.has('agent:lock:thread-expiry')).toBe(true);
    await second!.release();
    expect(fake.store.has('agent:lock:thread-expiry')).toBe(false);
  });

  it('fails open when the client source is unavailable', async () => {
    const provider = createRedisLockProvider({
      getClient: () => null,
    });

    const lock = await provider.acquire('thread-down');
    expect(lock).not.toBeNull();
    await expect(lock!.release()).resolves.toBeUndefined();
  });

  it('fails closed when the client source is unavailable', async () => {
    const provider = createRedisLockProvider({
      getClient: () => null,
    });

    await expect(provider.acquire('thread-down', { failClosed: true })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      status: 503,
    });
  });

  it('fails open when redis.set throws', async () => {
    const fake = makeFakeUpstashRedis();
    fake.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const provider = createRedisLockProvider(upstashRedisLockClient(fake));

    const lock = await provider.acquire('thread-error');
    expect(lock).not.toBeNull();
    await expect(lock!.release()).resolves.toBeUndefined();
  });

  it('fails closed when redis.set throws', async () => {
    const fake = makeFakeUpstashRedis();
    fake.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const provider = createRedisLockProvider(upstashRedisLockClient(fake));

    await expect(provider.acquire('thread-error', { failClosed: true })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      status: 503,
    });
  });
});
