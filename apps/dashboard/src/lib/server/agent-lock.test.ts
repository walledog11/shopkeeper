import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { acquireThreadLock as AcquireThreadLockFn } from './agent-lock';
import type { getRedis } from './redis';

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

let acquireThreadLock: typeof AcquireThreadLockFn;
let mockedGetRedis: ReturnType<typeof vi.mocked<typeof getRedis>>;

function makeFakeRedis() {
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

describe('acquireThreadLock', () => {
  beforeAll(async () => {
    ({ acquireThreadLock } = await import('./agent-lock'));
    ({ getRedis: mockedGetRedis } = await import('./redis').then(({ getRedis }) => ({
      getRedis: vi.mocked(getRedis),
    })));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('acquires a free lock and returns a release handle', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);


    const lock = await acquireThreadLock('thread-a');

    expect(lock).not.toBeNull();
    expect(fake.set).toHaveBeenCalledWith(
      'agent:lock:thread-a',
      expect.any(String),
      expect.objectContaining({ nx: true, ex: 90 }),
    );
    expect(fake.store.has('agent:lock:thread-a')).toBe(true);
  });

  it('returns null when the lock is already held', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);


    const first = await acquireThreadLock('thread-b');
    const second = await acquireThreadLock('thread-b');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('release deletes only its own token and allows re-acquisition', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);


    const lock = await acquireThreadLock('thread-c');
    expect(lock).not.toBeNull();
    await lock!.release();

    expect(fake.store.has('agent:lock:thread-c')).toBe(false);

    const reacquired = await acquireThreadLock('thread-c');
    expect(reacquired).not.toBeNull();
  });

  it('release is a no-op when another run owns the lock', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);


    const first = await acquireThreadLock('thread-d');
    expect(first).not.toBeNull();

    // Simulate TTL expiry + another run grabbing the slot.
    fake.store.set('agent:lock:thread-d', 'someone-else');

    await first!.release();

    expect(fake.store.get('agent:lock:thread-d')).toBe('someone-else');
  });

  it('fails open with a no-op lock when redis.set throws', async () => {
    const fake = makeFakeRedis();
    fake.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);

    const lock = await acquireThreadLock('thread-redis-down');

    expect(lock).not.toBeNull();
    // Releasing the no-op lock should not blow up.
    await expect(lock!.release()).resolves.toBeUndefined();
  });

  it('fails open when getRedis itself throws (e.g., missing env)', async () => {
    mockedGetRedis.mockImplementationOnce(() => {
      throw new Error('UPSTASH env missing');
    });

    const lock = await acquireThreadLock('thread-no-env');

    expect(lock).not.toBeNull();
    await expect(lock!.release()).resolves.toBeUndefined();
  });

  it('honors a custom TTL', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);


    await acquireThreadLock('thread-e', 30);

    expect(fake.set).toHaveBeenCalledWith(
      'agent:lock:thread-e',
      expect.any(String),
      expect.objectContaining({ nx: true, ex: 30 }),
    );
  });
});
