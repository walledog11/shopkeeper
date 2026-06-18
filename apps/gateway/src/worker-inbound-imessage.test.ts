import './test-fixtures/worker-test-setup.js';
import { describe, it, expect } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  getCapturedHandlers,
  makeImessageJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — imessage branch', () => {
  it('creates customer + thread + message with the Spectrum space id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const externalSpaceId = 'any;-;+15551234567';
    await handler!(makeImessageJob(org.id, '+15551234567', {
      externalMessageId: 'imsg_new_001',
      externalSpaceId,
      text: 'Can you help with my order?',
    }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: '+15551234567' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.imessage },
    });
    expect(thread).not.toBeNull();
    expect(thread?.status).toBe('open');
    expect(thread?.externalSpaceId).toBe(externalSpaceId);

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message).not.toBeNull();
    expect(message?.senderType).toBe('customer');
    expect(message?.contentText).toBe('Can you help with my order?');
    expect(message?.externalMessageId).toBe('imsg_new_001');
  });

  it('deduplicates replays by Spectrum message id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const job = makeImessageJob(org.id, '+15557654321', {
      externalMessageId: 'imsg_duplicate_001',
      externalSpaceId: 'any;-;+15557654321',
      text: 'Same webhook twice.',
    });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: '+15557654321' },
    });
    expect(customer).not.toBeNull();

    const threadCount = await db.thread.count({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.imessage },
    });
    expect(threadCount).toBe(1);

    const messageCount = await db.message.count({
      where: { organizationId: org.id, externalMessageId: 'imsg_duplicate_001' },
    });
    expect(messageCount).toBe(1);
  });

  it('persists uploaded attachment URLs from the webhook job', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeImessageJob(org.id, '+15559876543', {
      externalMessageId: 'imsg_attachment_001',
      externalSpaceId: 'any;-;+15559876543',
      text: 'Attachment: receipt.png',
      attachmentUrls: ['blob:attachments/org/file/receipt.png'],
    }));

    const message = await db.message.findFirst({
      where: { organizationId: org.id, externalMessageId: 'imsg_attachment_001' },
    });
    expect(message?.attachments).toEqual(['blob:attachments/org/file/receipt.png']);
  });
});
