import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';

const { sendOperatorEventReplySpy } = vi.hoisted(() => ({
  sendOperatorEventReplySpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../operator-event-reply.js', () => ({
  sendOperatorEventReply: sendOperatorEventReplySpy,
}));

vi.mock('../logger.js', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { runOperatorEventSweep } from './operator-event-sweep.js';

const MINUTES_AGO = (n: number) => new Date(Date.now() - n * 60 * 1000);

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const SENDER_ID = '990500';

async function seedEvent(overrides: Record<string, unknown>): Promise<string> {
  const event = await db.operatorEvent.create({
    data: {
      organizationId: org.id,
      channel: 'telegram',
      providerMessageId: `telegram:${SENDER_ID}:${randomUUID()}`,
      chatId: SENDER_ID,
      clerkUserId: 'usr_sweep',
      operatorKey: `telegram:${SENDER_ID}`,
      body: 'refund #1234',
      ...overrides,
    },
  });
  return event.id;
}

function claimed(claimedAt: Date): Record<string, unknown> {
  return { status: 'claimed', claimToken: randomUUID(), claimedAt };
}

function committed(processedAt: Date, reply: string | null, delivered: Date | null): Record<string, unknown> {
  return {
    status: 'committed',
    claimToken: randomUUID(),
    claimedAt: processedAt,
    processedAt,
    replyText: reply,
    replyDeliveredAt: delivered,
  };
}

beforeEach(async () => {
  org = await createTestOrg();
  sendOperatorEventReplySpy.mockClear().mockResolvedValue(true);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('runOperatorEventSweep', () => {
  it('reconciles a stale claimed event to unknown, keeping the claim token and setting processedAt', async () => {
    const id = await seedEvent(claimed(MINUTES_AGO(11)));

    await runOperatorEventSweep();

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('unknown');
    expect(row?.processedAt).toBeTruthy();
    // Terminal-state CHECK requires the claim token stays set.
    expect(row?.claimToken).toBeTruthy();
    expect(row?.lastError).toMatch(/unknown|review/i);
  });

  it('leaves a freshly claimed event alone (does not race a live worker)', async () => {
    const id = await seedEvent(claimed(MINUTES_AGO(1)));

    await runOperatorEventSweep();

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('claimed');
    expect(row?.processedAt).toBeNull();
  });

  it('re-sends a committed-but-undelivered reply and marks it delivered', async () => {
    const id = await seedEvent(committed(MINUTES_AGO(6), 'Refunded Sarah $12.', null));

    await runOperatorEventSweep();

    expect(sendOperatorEventReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      'Refunded Sarah $12.',
    );
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.replyDeliveredAt).toBeTruthy();
  });

  it('does not re-send a just-committed reply (inside the delivery window)', async () => {
    const id = await seedEvent(committed(MINUTES_AGO(1), 'Refunded Sarah $12.', null));

    await runOperatorEventSweep();

    expect(sendOperatorEventReplySpy).not.toHaveBeenCalled();
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.replyDeliveredAt).toBeNull();
  });

  it('leaves the reply undelivered when the provider re-send fails', async () => {
    sendOperatorEventReplySpy.mockResolvedValue(false);
    const id = await seedEvent(committed(MINUTES_AGO(6), 'Refunded Sarah $12.', null));

    await runOperatorEventSweep();

    expect(sendOperatorEventReplySpy).toHaveBeenCalledOnce();
    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.replyDeliveredAt).toBeNull();
  });

  it('records an ambiguous resend and does not try it again automatically', async () => {
    sendOperatorEventReplySpy.mockResolvedValue('unknown');
    const id = await seedEvent(committed(MINUTES_AGO(6), 'Refunded Sarah $12.', null));

    await runOperatorEventSweep();

    const row = await db.operatorEvent.findUnique({ where: { id } });
    expect(row?.replyDeliveredAt).toBeNull();
    expect(row?.lastError).toMatch(/may have reached the provider/i);

    sendOperatorEventReplySpy.mockClear();
    await runOperatorEventSweep();
    expect(sendOperatorEventReplySpy).not.toHaveBeenCalled();
  });

  it('does not re-send an already-delivered committed reply', async () => {
    await seedEvent(committed(MINUTES_AGO(30), 'Refunded Sarah $12.', MINUTES_AGO(30)));

    await runOperatorEventSweep();

    expect(sendOperatorEventReplySpy).not.toHaveBeenCalled();
  });
});
