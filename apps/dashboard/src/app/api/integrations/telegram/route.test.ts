import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';

const { mockAuth, mockRedisSet } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ set: mockRedisSet }),
}));

import { DELETE, GET, POST } from './route';

const originalBotUsername = process.env.TELEGRAM_BOT_USERNAME;

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(async () => {
  org = await createTestOrg();
  process.env.TELEGRAM_BOT_USERNAME = 'support_test_bot';
  mockAuth.mockResolvedValue({ userId: 'usr_telegram', orgId: org.clerkOrgId });
  mockRedisSet.mockResolvedValue('OK');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  if (originalBotUsername === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
  else process.env.TELEGRAM_BOT_USERNAME = originalBotUsername;
  vi.clearAllMocks();
});

describe('/api/integrations/telegram', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it('reports the current user binding without exposing other members', async () => {
    await db.orgMember.createMany({
      data: [
        { organizationId: org!.id, clerkUserId: 'usr_telegram', telegramChatId: 'chat_current' },
        { organizationId: org!.id, clerkUserId: 'usr_other', telegramChatId: 'chat_other' },
      ],
    });

    const res = await GET();
    const body = await res.json() as { connected: boolean; chatId: string | null; botUsername: string | null };

    expect(res.status).toBe(200);
    expect(body).toEqual({
      connected: true,
      chatId: 'chat_current',
      botUsername: 'support_test_bot',
    });
  });

  it('returns 503 without creating a token when Telegram is not configured', async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;

    const res = await POST();

    expect(res.status).toBe(503);
    expect(mockRedisSet).not.toHaveBeenCalled();
    await expect(db.orgMember.count({ where: { organizationId: org!.id } })).resolves.toBe(0);
  });

  it('creates a scoped single-use bind token for the current user', async () => {
    const res = await POST();
    const body = await res.json() as { url: string; expiresInSeconds: number };

    expect(res.status).toBe(200);
    expect(body.expiresInSeconds).toBe(86_400);
    expect(body.url).toMatch(/^https:\/\/t\.me\/support_test_bot\?start=/);

    const token = new URL(body.url).searchParams.get('start');
    expect(token).toBeTruthy();
    expect(mockRedisSet).toHaveBeenCalledWith(
      `telegram:bind:${token}`,
      JSON.stringify({ orgId: org!.id, clerkUserId: 'usr_telegram' }),
      { ex: 86_400 },
    );

    await expect(db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org!.id, clerkUserId: 'usr_telegram' } },
    })).resolves.toEqual(expect.objectContaining({ telegramChatId: null }));
  });

  it('disconnects only the current user binding', async () => {
    await db.orgMember.createMany({
      data: [
        { organizationId: org!.id, clerkUserId: 'usr_telegram', telegramChatId: 'chat_current' },
        { organizationId: org!.id, clerkUserId: 'usr_other', telegramChatId: 'chat_other' },
      ],
    });

    const res = await DELETE();

    expect(res.status).toBe(200);
    await expect(db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org!.id, clerkUserId: 'usr_telegram' } },
    })).resolves.toEqual(expect.objectContaining({ telegramChatId: null }));
    await expect(db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org!.id, clerkUserId: 'usr_other' } },
    })).resolves.toEqual(expect.objectContaining({ telegramChatId: 'chat_other' }));
  });
});
