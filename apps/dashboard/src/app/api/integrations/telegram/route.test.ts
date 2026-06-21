import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';

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
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_telegram' },
    });
    const other = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_other' },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: me.id, chatId: 'chat_current', displayName: 'Raj Sambi', username: 'raj_shop' },
        { orgMemberId: other.id, chatId: 'chat_other' },
      ],
    });

    const res = await GET();
    const body = await res.json() as {
      connected: boolean;
      chats: { chatId: string; connectedAt: string; displayLabel: string | null }[];
      botUsername: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.chats).toHaveLength(1);
    expect(body.chats[0].chatId).toBe('chat_current');
    expect(body.chats[0].displayLabel).toBe('Raj Sambi');
    expect(body.botUsername).toBe('support_test_bot');
  });

  it('falls back to username when a Telegram display name is unavailable', async () => {
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_telegram' },
    });
    await db.orgMemberTelegramChat.create({
      data: { orgMemberId: me.id, chatId: 'chat_username', username: 'support_owner' },
    });

    const res = await GET();
    const body = await res.json() as {
      chats: { chatId: string; displayLabel: string | null }[];
    };

    expect(res.status).toBe(200);
    expect(body.chats).toEqual([
      expect.objectContaining({ chatId: 'chat_username', displayLabel: '@support_owner' }),
    ]);
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

    // Member should exist but have no telegram chats yet (binding happens via the bot)
    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org!.id, clerkUserId: 'usr_telegram' } },
      include: { telegramChats: true },
    });
    expect(member).not.toBeNull();
    expect(member!.telegramChats).toHaveLength(0);
  });

  it('disconnects only the current user binding', async () => {
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_telegram' },
    });
    const other = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_other' },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: me.id, chatId: 'chat_current' },
        { orgMemberId: other.id, chatId: 'chat_other' },
      ],
    });

    const res = await DELETE();

    expect(res.status).toBe(200);
    await expect(
      db.orgMemberTelegramChat.findMany({ where: { orgMemberId: me.id } }),
    ).resolves.toHaveLength(0);
    await expect(
      db.orgMemberTelegramChat.findMany({ where: { orgMemberId: other.id } }),
    ).resolves.toHaveLength(1);
  });

  it('returns 409 when device limit is reached', async () => {
    const me = await db.orgMember.create({
      data: { organizationId: org!.id, clerkUserId: 'usr_telegram' },
    });
    await db.orgMemberTelegramChat.createMany({
      data: [
        { orgMemberId: me.id, chatId: 'cap_chat_1' },
        { orgMemberId: me.id, chatId: 'cap_chat_2' },
        { orgMemberId: me.id, chatId: 'cap_chat_3' },
      ],
    });

    const res = await POST();

    expect(res.status).toBe(409);
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
