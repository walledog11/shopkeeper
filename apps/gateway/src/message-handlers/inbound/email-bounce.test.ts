import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, SenderType } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { recordEmailBounce, type EmailBounceEvent } from './email-bounce.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

async function seedSentEmail(providerMessageId: string | null) {
  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `bounce-${providerMessageId ?? 'none'}@example.com`,
      name: 'Jane',
    },
  });
  const thread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      channelType: 'email',
      status: 'open',
      subject: 'Your order',
    },
  });
  const message = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.agent,
      contentText: 'Your order shipped.',
      sendStatus: 'sent',
      providerMessageId,
    },
  });
  return { thread, message };
}

function event(overrides: Partial<EmailBounceEvent> = {}): EmailBounceEvent {
  return {
    provider: 'postmark',
    locator: { kind: 'provider_message_id', value: 'postmark-msg-1' },
    recipient: 'jane@example.com',
    bounceType: 'HardBounce',
    detail: '550 5.1.1 No such user',
    permanent: true,
    ...overrides,
  };
}

describe('recordEmailBounce', () => {
  it('moves the message out of sent and leaves a visible note on the thread', async () => {
    const { thread, message } = await seedSentEmail('postmark-msg-1');

    await expect(recordEmailBounce(event())).resolves.toBe('recorded');

    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendStatus).toBe('bounced');
    expect(updated.sendError).toBe('550 5.1.1 No such user');

    const notes = await db.message.findMany({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].contentText).toContain('permanently rejected');
    expect(notes[0].contentText).toContain('jane@example.com');
    expect(notes[0].contentText).toContain('550 5.1.1 No such user');
  });

  it('words a soft bounce as not-yet-delivered', async () => {
    const { thread } = await seedSentEmail('postmark-msg-1');

    await recordEmailBounce(event({ permanent: false, bounceType: 'SoftBounce' }));

    const note = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(note.contentText).toContain('could not be delivered yet');
    expect(note.contentText).toContain('may still retry');
  });

  // Postmark re-sends a webhook it did not get a 2xx for, so a repeat must not
  // stack a second note on the thread.
  it('is idempotent across repeated deliveries of the same bounce', async () => {
    const { thread } = await seedSentEmail('postmark-msg-1');

    await expect(recordEmailBounce(event())).resolves.toBe('recorded');
    await expect(recordEmailBounce(event())).resolves.toBe('already_recorded');

    const notes = await db.message.findMany({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(notes).toHaveLength(1);
  });

  it('reports an unmatched bounce rather than throwing', async () => {
    await seedSentEmail('postmark-msg-1');

    await expect(recordEmailBounce(event({
      locator: { kind: 'provider_message_id', value: 'never-sent-this' },
    }))).resolves.toBe('unmatched');
  });

  it('matches a Gmail DSN by our own outbound message id', async () => {
    const { thread, message } = await seedSentEmail(null);

    await expect(recordEmailBounce(event({
      provider: 'gmail',
      locator: { kind: 'outbound_message_id', value: message.id },
      recipient: null,
      detail: 'smtp; 550 5.1.1 No such user',
    }))).resolves.toBe('recorded');

    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendStatus).toBe('bounced');

    const note = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    // No recipient on a DSN, so the note must still read cleanly without one.
    expect(note.contentText).toContain('the reply was permanently rejected');
  });

  it('falls back to a provider-derived error when the bounce carries no detail', async () => {
    const { message } = await seedSentEmail('postmark-msg-1');

    await recordEmailBounce(event({ detail: null }));

    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendError).toBe('postmark reported a HardBounce');
  });

  it('ignores a soft-deleted message', async () => {
    const { message } = await seedSentEmail('postmark-msg-1');
    await db.message.update({ where: { id: message.id }, data: { deletedAt: new Date() } });

    await expect(recordEmailBounce(event())).resolves.toBe('unmatched');
  });
});
