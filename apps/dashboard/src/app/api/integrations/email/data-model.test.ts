import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, EmailProvider, SenderType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('independent email integration data model', () => {
  it('allows one Gmail and one Postmark row but rejects a second row for either provider', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'merchant@gmail.test',
    });
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'support@example.test',
    });

    await expect(createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'other@gmail.test',
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'other-support@example.test',
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows Gmail and Postmark to share the same external support address', async () => {
    const address = 'support@same-address.test';
    const gmail = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: address,
    });
    const postmark = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: address,
    });

    expect(gmail.externalAccountId).toBe(address);
    expect(postmark.externalAccountId).toBe(address);
  });

  it('sets default, thread source, and message attribution to null when an integration is deleted', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'merchant@gmail.test',
    });
    const customer = await createTestCustomer(org.id, 'customer@example.test');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        replyIntegrationId: integration.id,
        replyIntegrationUpdatedAt: new Date(),
      },
    });
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        integrationId: integration.id,
        senderType: SenderType.customer,
        contentText: 'Hello',
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: integration.id },
    });

    await db.integration.delete({ where: { id: integration.id } });

    await expect(db.organization.findUniqueOrThrow({ where: { id: org.id } }))
      .resolves.toMatchObject({ defaultEmailIntegrationId: null });
    await expect(db.thread.findUniqueOrThrow({ where: { id: thread.id } }))
      .resolves.toMatchObject({
        replyIntegrationId: null,
        replyIntegrationUpdatedAt: expect.any(Date),
      });
    await expect(db.message.findUniqueOrThrow({ where: { id: message.id } }))
      .resolves.toMatchObject({ integrationId: null });
  });

  it('keeps attribution nullable for ambiguous historical records', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: 'merchant@gmail.test',
    });
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: 'support@example.test',
    });
    const customer = await createTestCustomer(org.id, 'historical@example.test');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.customer,
        contentText: 'Historical message',
      },
    });

    expect(thread.replyIntegrationId).toBeNull();
    expect(message.integrationId).toBeNull();
  });
});
