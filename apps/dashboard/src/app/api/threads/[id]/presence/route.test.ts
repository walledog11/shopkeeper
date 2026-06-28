import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, redis } = vi.hoisted(() => ({
  auth: vi.fn(),
  redis: {
    expire: vi.fn(),
    zadd: vi.fn(),
    zrange: vi.fn(),
    zrem: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth }));
vi.mock('@/lib/server/redis', () => ({ getRedis: () => redis }));

import { DELETE, PUT } from './route';

const context = { params: Promise.resolve({ id: 'thread-1' }) };

describe('/api/threads/:id/presence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
    redis.zadd.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.zrange.mockResolvedValue(['user-1', 'user-2', 'user-3']);
    redis.zrem.mockResolvedValue(1);
  });

  it('requires an authenticated active organization', async () => {
    auth.mockResolvedValue({ userId: null, orgId: null });

    await expect(PUT(new Request('http://localhost'), context)).resolves.toMatchObject({ status: 401 });
    expect(redis.zadd).not.toHaveBeenCalled();
  });

  it('records the caller and counts only other active viewers', async () => {
    const response = await PUT(new Request('http://localhost'), context);

    expect(await response.json()).toEqual({ count: 2 });
    expect(redis.zadd).toHaveBeenCalledWith(
      'presence:org-1:thread-1',
      { gt: true },
      { score: expect.any(Number), member: 'user-1' },
    );
    expect(redis.expire).toHaveBeenCalledWith('presence:org-1:thread-1', 80);
  });

  it('fails open when presence storage is unavailable', async () => {
    redis.zadd.mockRejectedValue(new Error('Redis unavailable'));

    const response = await PUT(new Request('http://localhost'), context);

    expect(await response.json()).toEqual({ count: 0 });
  });

  it('removes only the current org-scoped viewer', async () => {
    const response = await DELETE(new Request('http://localhost'), context);

    expect(await response.json()).toEqual({ ok: true });
    expect(redis.zrem).toHaveBeenCalledWith('presence:org-1:thread-1', 'user-1');
  });
});
