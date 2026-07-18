import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import type { OperatorReply } from './routes/operator-message.js';

const { sendImessageToSpaceSpy, runTurnSpy, mockLogger } = vi.hoisted(() => ({
  sendImessageToSpaceSpy: vi.fn().mockResolvedValue(undefined),
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

vi.mock('./clients/spectrum.js', () => ({
  sendImessageToSpace: sendImessageToSpaceSpy,
  sendImessageOnSpace: vi.fn().mockResolvedValue(undefined),
  getPlatformSpectrumApp: vi.fn(),
  SpectrumIntegrationConfigError: class SpectrumIntegrationConfigError extends Error {},
}));

vi.mock('./logger.js', () => ({ default: mockLogger }));

// Keep the real binding re-validation; control only the turn itself.
vi.mock('./routes/imessage/message-handler.js', async (importActual) => {
  const actual = await importActual<typeof import('./routes/imessage/message-handler.js')>();
  return { ...actual, runImessageOperatorTurn: runTurnSpy };
});

import { processOperatorEventById } from './workers/operator-event.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
// Distinct sender namespace so the globally-unique OperatorEvent /
// OrgMemberImessageBinding rows do not collide with other test files on the DB.
const SENDER_ID = '+15559900010';
const SPACE_ID = 'any;-;+15559900010';
const CLERK_USER = 'usr_imsg_worker_evt';

async function seedBoundMember(): Promise<void> {
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: CLERK_USER },
  });
  await db.orgMemberImessageBinding.create({
    data: { orgMemberId: member.id, senderId: SENDER_ID, spaceId: SPACE_ID },
  });
}

async function seedEvent(overrides: Record<string, unknown> = {}): Promise<string> {
  const event = await db.operatorEvent.create({
    data: {
      organizationId: org.id,
      channel: 'imessage',
      providerMessageId: `imessage:imsg_${Math.random().toString(36).slice(2)}`,
      chatId: SENDER_ID,
      spaceId: SPACE_ID,
      clerkUserId: CLERK_USER,
      operatorKey: `imessage:${SENDER_ID}`,
      body: 'refund #1234',
      ...overrides,
    },
  });
  return event.id;
}

beforeEach(async () => {
  org = await createTestOrg();
  sendImessageToSpaceSpy.mockClear().mockResolvedValue(undefined);
  runTurnSpy.mockReset();
});

afterEach(async () => {
  await db.orgMember.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('processOperatorEventById — iMessage', () => {
  it('runs the turn once, delivers the reply on the bound space, and commits', async () => {
    await seedBoundMember();
    const id = await seedEvent();
    runTurnSpy.mockImplementation(async ({ reply }: { reply: OperatorReply }) => {
      await reply('Refunded Sarah $12.');
    });

    await processOperatorEventById(id);

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    expect(runTurnSpy).toHaveBeenCalledWith(expect.objectContaining({ turnId: id }));
    expect(sendImessageToSpaceSpy).toHaveBeenCalledWith(SPACE_ID, 'Refunded Sarah $12.', expect.anything());
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('committed');
    expect(row?.replyText).toBe('Refunded Sarah $12.');
    expect(row?.replyDeliveredAt).toBeTruthy();
  });

  it('fails without running the turn when the binding is revoked', async () => {
    // No bound member seeded → resolveBoundImessageMember returns null.
    const id = await seedEvent();

    await processOperatorEventById(id);

    expect(runTurnSpy).not.toHaveBeenCalled();
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toMatch(/binding/i);
  });

  it('commits but leaves the reply undelivered when the provider send throws', async () => {
    await seedBoundMember();
    const id = await seedEvent();
    sendImessageToSpaceSpy.mockRejectedValue(new Error('spectrum down'));
    runTurnSpy.mockImplementation(async ({ reply }: { reply: OperatorReply }) => {
      await reply('Refunded Sarah $12.');
    });

    await processOperatorEventById(id);

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('committed');
    expect(row?.replyText).toBe('Refunded Sarah $12.');
    // The turn committed but the confirmation never reached the provider.
    expect(row?.replyDeliveredAt).toBeNull();
  });
});
