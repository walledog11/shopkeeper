import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ChannelType, db, SenderType } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { webhookFixture } from '../test-fixtures/webhook-routes-test-fixture.js';

const { app, queueAddSpy } = webhookFixture;
let org: { id: string };

beforeEach(async () => {
  org = webhookFixture.org;
  await createTestIntegration(org.id, {
    platform: ChannelType.email,
    externalAccountId: `support-${org.id.slice(0, 8)}@example.com`,
  });
});

async function seedSentEmail(providerMessageId: string) {
  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `bounce-route-${providerMessageId}@example.com`,
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
  return db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.agent,
      contentText: 'Your order shipped.',
      sendStatus: 'sent',
      providerMessageId,
    },
  });
}

describe('POST /webhooks/email/bounce', () => {
  it('marks the matching outbound message bounced', async () => {
    const message = await seedSentEmail('postmark-bounce-1');

    const res = await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'Bounce',
      Type: 'HardBounce',
      MessageID: 'postmark-bounce-1',
      Email: 'Jane <JANE@example.com>',
      Description: 'The server was unable to deliver your message.',
      Inactive: true,
    });

    expect(res.status).toBe(200);
    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendStatus).toBe('bounced');

    const note = await db.message.findFirstOrThrow({
      where: { threadId: message.threadId, senderType: SenderType.note },
    });
    // The address is normalized before it reaches the merchant-visible note.
    expect(note.contentText).toContain('jane@example.com');
  });

  it('treats a SoftBounce without Inactive as transient', async () => {
    const message = await seedSentEmail('postmark-bounce-2');

    await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'Bounce',
      Type: 'SoftBounce',
      MessageID: 'postmark-bounce-2',
      Email: 'jane@example.com',
    });

    const note = await db.message.findFirstOrThrow({
      where: { threadId: message.threadId, senderType: SenderType.note },
    });
    expect(note.contentText).toContain('could not be delivered yet');
  });

  it('records a spam complaint as permanent', async () => {
    const message = await seedSentEmail('postmark-bounce-3');

    await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'SpamComplaint',
      MessageID: 'postmark-bounce-3',
      Email: 'jane@example.com',
    });

    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendStatus).toBe('bounced');
  });

  // Postmark retries any non-2xx, and neither of these will ever start matching.
  it('acknowledges an unmatched MessageID instead of failing', async () => {
    const res = await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'Bounce',
      Type: 'HardBounce',
      MessageID: 'never-sent-this',
      Email: 'jane@example.com',
    });

    expect(res.status).toBe(200);
  });

  it('acknowledges a payload with no MessageID', async () => {
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .send({ RecordType: 'Bounce', Type: 'HardBounce' });

    expect(res.status).toBe(200);
  });

  it('ignores unrelated Postmark record types', async () => {
    const message = await seedSentEmail('postmark-bounce-4');

    const res = await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'Delivery',
      MessageID: 'postmark-bounce-4',
    });

    expect(res.status).toBe(200);
    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.sendStatus).toBe('sent');
  });

  it('never enqueues inbound work from a bounce', async () => {
    await seedSentEmail('postmark-bounce-5');
    queueAddSpy.mockClear();

    await request(app).post('/webhooks/email/bounce').send({
      RecordType: 'Bounce',
      Type: 'HardBounce',
      MessageID: 'postmark-bounce-5',
      Email: 'jane@example.com',
    });

    expect(queueAddSpy).not.toHaveBeenCalled();
  });
});
