import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import type { TelegramReply } from './routes/telegram/types.js';

const { sendMessageSpy, runTurnSpy, mockLogger } = vi.hoisted(() => ({
  sendMessageSpy: vi.fn().mockResolvedValue(true),
  runTurnSpy: vi.fn(),
  mockLogger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
  }),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = vi.fn();
    this.close = vi.fn();
  }),
}));

vi.mock('./clients/telegram-client.js', () => ({
  isTelegramConfigured: vi.fn(() => true),
  sendMessage: sendMessageSpy,
  sendChatAction: vi.fn().mockResolvedValue(true),
  setMessageReaction: vi.fn().mockResolvedValue(true),
  setWebhook: vi.fn(),
}));

vi.mock('./logger.js', () => ({ default: mockLogger }));

// Keep the real binding re-validation; control only the turn itself.
vi.mock('./routes/telegram/message-handler.js', async (importActual) => {
  const actual = await importActual<typeof import('./routes/telegram/message-handler.js')>();
  return { ...actual, runTelegramOperatorTurn: runTurnSpy };
});

import { processOperatorEventById } from './workers/operator-event.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Distinct chatId namespace so the globally-unique OperatorEvent /
// OrgMemberTelegramChat rows do not collide with other test files on the DB.
const CHAT_ID = '990002';
const CLERK_USER = 'usr_worker_evt';

async function seedBoundMember(): Promise<void> {
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: CLERK_USER },
  });
  await db.orgMemberTelegramChat.create({
    data: { orgMemberId: member.id, chatId: CHAT_ID },
  });
}

async function seedEvent(overrides: Record<string, unknown> = {}): Promise<string> {
  const event = await db.operatorEvent.create({
    data: {
      organizationId: org.id,
      channel: 'telegram',
      providerMessageId: `telegram:${CHAT_ID}:1`,
      chatId: CHAT_ID,
      clerkUserId: CLERK_USER,
      operatorKey: `telegram:${CHAT_ID}`,
      body: 'refund #1234',
      metadata: { messageId: 1 },
      ...overrides,
    },
  });
  return event.id;
}

beforeEach(async () => {
  org = await createTestOrg();
  sendMessageSpy.mockClear().mockResolvedValue(true);
  runTurnSpy.mockReset();
});

afterEach(async () => {
  await db.orgMember.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('processOperatorEventById', () => {
  it('runs the turn once, delivers the reply, and commits', async () => {
    await seedBoundMember();
    const id = await seedEvent();
    runTurnSpy.mockImplementation(async ({ reply }: { reply: TelegramReply }) => {
      await reply('Refunded Sarah $12.');
    });

    await processOperatorEventById(id);

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    expect(runTurnSpy).toHaveBeenCalledWith(expect.objectContaining({ turnId: id }));
    expect(sendMessageSpy).toHaveBeenCalledWith(CHAT_ID, 'Refunded Sarah $12.', expect.anything());
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('committed');
    expect(row?.replyText).toBe('Refunded Sarah $12.');
    expect(row?.replyDeliveredAt).toBeTruthy();
  });

  it('does not re-run a claimed event (crash-after-claim is not replayed)', async () => {
    await seedBoundMember();
    // Simulate a prior attempt that claimed then crashed mid-turn.
    const id = await seedEvent({
      status: 'claimed',
      claimToken: '00000000-0000-4000-8000-000000000000',
      claimedAt: new Date(),
    });

    await processOperatorEventById(id);

    expect(runTurnSpy).not.toHaveBeenCalled();
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('claimed');
  });

  it('does not re-run a committed event (redelivery is a no-op)', async () => {
    await seedBoundMember();
    const id = await seedEvent({
      status: 'committed',
      claimToken: '00000000-0000-4000-8000-000000000000',
      claimedAt: new Date(),
      processedAt: new Date(),
    });

    await processOperatorEventById(id);
    expect(runTurnSpy).not.toHaveBeenCalled();
  });

  it('fails without running the turn when the binding is revoked', async () => {
    // No bound member seeded → resolveBoundTelegramMember returns null.
    const id = await seedEvent();

    await processOperatorEventById(id);

    expect(runTurnSpy).not.toHaveBeenCalled();
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toMatch(/binding/i);
  });

  it('commits but leaves reply undelivered when the provider send fails', async () => {
    await seedBoundMember();
    const id = await seedEvent();
    sendMessageSpy.mockResolvedValue(false);
    runTurnSpy.mockImplementation(async ({ reply }: { reply: TelegramReply }) => {
      await reply('Refunded Sarah $12.');
    });

    await processOperatorEventById(id);

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('committed');
    expect(row?.replyText).toBe('Refunded Sarah $12.');
    // The turn committed but the confirmation never reached the provider.
    expect(row?.replyDeliveredAt).toBeNull();
  });

  it('records a failed turn and does not mark it committed', async () => {
    await seedBoundMember();
    const id = await seedEvent();
    runTurnSpy.mockRejectedValue(new Error('boom'));

    await processOperatorEventById(id);

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toBe('boom');
    // Merchant is told once.
    expect(sendMessageSpy).toHaveBeenCalledWith(CHAT_ID, expect.stringMatching(/unexpected error/i), expect.anything());
  });
});
