import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { runOutboundSendSweep } from './outbound-send-sweep.js';

const ELEVEN_MINUTES_AGO = () => new Date(Date.now() - 11 * 60 * 1000);
const ONE_MINUTE_AGO = () => new Date(Date.now() - 60 * 1000);

describe('runOutboundSendSweep', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let threadId: string;

  beforeEach(async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, 'customer@example.com', { name: 'Cust' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    threadId = thread.id;
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  async function createMessage(
    threadIdArg: string,
    sendStatus: string | null,
    sentAt: Date,
    claim: { claimedAt?: Date; attemptedAt?: Date | null } = {},
  ) {
    return db.message.create({
      data: {
        threadId: threadIdArg,
        organizationId: org.id,
        senderType: SenderType.agent,
        contentText: 'Hi',
        sendStatus,
        ...(claim.claimedAt && {
          sendClaimToken: crypto.randomUUID(),
          sendClaimedAt: claim.claimedAt,
          sendAttemptedAt: claim.attemptedAt ?? null,
        }),
        sentAt,
      },
    });
  }

  it('marks a stale pending message as failed', async () => {
    const message = await createMessage(threadId, 'pending', ELEVEN_MINUTES_AGO());

    await runOutboundSendSweep();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toBeTruthy();
  });

  it('leaves a recently created pending message alone', async () => {
    const message = await createMessage(threadId, 'pending', ONE_MINUTE_AGO());

    await runOutboundSendSweep();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('pending');
    expect(after?.sendError).toBeNull();
  });

  it('marks a stale pre-provider claim failed so it can be retried safely', async () => {
    const message = await createMessage(threadId, 'processing', ELEVEN_MINUTES_AGO(), {
      claimedAt: ELEVEN_MINUTES_AGO(),
      attemptedAt: null,
    });

    await runOutboundSendSweep();

    const after = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.sendStatus).toBe('failed');
    expect(after.sendClaimToken).toBeNull();
    expect(after.sendError).toContain('Retry to resend');
  });

  it('marks a stale post-provider claim unknown without offering an unsafe retry', async () => {
    const message = await createMessage(threadId, 'processing', ELEVEN_MINUTES_AGO(), {
      claimedAt: ELEVEN_MINUTES_AGO(),
      attemptedAt: ELEVEN_MINUTES_AGO(),
    });

    await runOutboundSendSweep();

    const after = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.sendStatus).toBe('unknown');
    expect(after.sendClaimToken).toBeNull();
    expect(after.sendError).toContain('Do not retry');
  });

  it('leaves a recent processing claim alone', async () => {
    const message = await createMessage(threadId, 'processing', ONE_MINUTE_AGO(), {
      claimedAt: ONE_MINUTE_AGO(),
      attemptedAt: ONE_MINUTE_AGO(),
    });

    await runOutboundSendSweep();

    const after = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.sendStatus).toBe('processing');
  });

  it('does not touch sent, failed, or non-async messages', async () => {
    const sent = await createMessage(threadId, 'sent', ELEVEN_MINUTES_AGO());
    const failed = await createMessage(threadId, 'failed', ELEVEN_MINUTES_AGO());
    const sync = await createMessage(threadId, null, ELEVEN_MINUTES_AGO());

    await runOutboundSendSweep();

    expect((await db.message.findUnique({ where: { id: sent.id } }))?.sendStatus).toBe('sent');
    expect((await db.message.findUnique({ where: { id: failed.id } }))?.sendStatus).toBe('failed');
    expect((await db.message.findUnique({ where: { id: sync.id } }))?.sendStatus).toBeNull();
  });

  it('sweeps a stale pending iMessage send (channel-agnostic)', async () => {
    const customer = await createTestCustomer(org.id, '+15551234567', { name: 'iMsg Cust' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.imessage);
    const message = await createMessage(thread.id, 'pending', ELEVEN_MINUTES_AGO());

    await runOutboundSendSweep();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toBeTruthy();
  });
});
