import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { runOutboundEmailSweep } from './outbound-email-sweep.js';

const ELEVEN_MINUTES_AGO = () => new Date(Date.now() - 11 * 60 * 1000);
const ONE_MINUTE_AGO = () => new Date(Date.now() - 60 * 1000);

describe('runOutboundEmailSweep', () => {
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

  async function createMessage(sendStatus: string | null, sentAt: Date) {
    return db.message.create({
      data: {
        threadId,
        organizationId: org.id,
        senderType: SenderType.agent,
        contentText: 'Hi',
        sendStatus,
        sentAt,
      },
    });
  }

  it('marks a stale pending message as failed', async () => {
    const message = await createMessage('pending', ELEVEN_MINUTES_AGO());

    await runOutboundEmailSweep();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toBeTruthy();
  });

  it('leaves a recently created pending message alone', async () => {
    const message = await createMessage('pending', ONE_MINUTE_AGO());

    await runOutboundEmailSweep();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('pending');
    expect(after?.sendError).toBeNull();
  });

  it('does not touch sent, failed, or non-async messages', async () => {
    const sent = await createMessage('sent', ELEVEN_MINUTES_AGO());
    const failed = await createMessage('failed', ELEVEN_MINUTES_AGO());
    const sync = await createMessage(null, ELEVEN_MINUTES_AGO());

    await runOutboundEmailSweep();

    expect((await db.message.findUnique({ where: { id: sent.id } }))?.sendStatus).toBe('sent');
    expect((await db.message.findUnique({ where: { id: failed.id } }))?.sendStatus).toBe('failed');
    expect((await db.message.findUnique({ where: { id: sync.id } }))?.sendStatus).toBeNull();
  });
});
