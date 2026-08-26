import './test-fixtures/worker-test-setup.js';
import { describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  getCapturedHandlers,
  getMockFetch,
  makeTikTokShopJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — TikTok Shop branch', () => {
  it('creates customer + thread + message for a buyer message', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeTikTokShopJob(org.id, {
      accountId: 'shop_worker_001',
      buyerId: 'buyer_worker_001',
      conversationId: 'conversation_worker_001',
      messageId: 'message_worker_001',
    }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'tiktok:shop_worker_001:buyer_worker_001' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.tiktok },
    });
    expect(thread).not.toBeNull();
    expect(thread?.externalSpaceId).toBe('conversation_worker_001');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message?.senderType).toBe('customer');
    expect(message?.contentText).toBe('Hi from TikTok Shop');
    expect(message?.externalMessageId).toBe('tiktok:shop_worker_001:message_worker_001');
  });

  it('stores attachment-only buyer messages with TikTok image placeholders and private blobs', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    getMockFetch().mockResolvedValueOnce(new Response(Buffer.from('image bytes'), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));

    await handler!(makeTikTokShopJob(org.id, {
      accountId: 'shop_attachment_001',
      buyerId: 'buyer_attachment_001',
      messageId: 'message_attachment_001',
      text: '',
      attachments: [{ url: 'https://p16-oec-sg.ibyteimg.com/photo.jpg' }],
    }));

    const message = await db.message.findFirst({
      where: { organizationId: org.id, externalMessageId: 'tiktok:shop_attachment_001:message_attachment_001' },
    });
    expect(message?.contentText).toBe('[TikTok image attachment]');
    expect(message?.attachments).toHaveLength(1);
    expect(message?.attachments?.[0]).toMatch(
      new RegExp(`^blob:attachments/${org.id}/[0-9a-f-]+/tiktok-image.jpg$`),
    );
    expect(message?.attachments?.[0]).not.toContain('ibyteimg.com');
  });

  it('dedupes TikTok Shop webhook retries by provider message id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const job = makeTikTokShopJob(org.id, {
      accountId: 'shop_duplicate_001',
      buyerId: 'buyer_duplicate_001',
      messageId: 'message_duplicate_001',
    });

    await handler!(job);
    await handler!(job);

    const messages = await db.message.count({
      where: { externalMessageId: 'tiktok:shop_duplicate_001:message_duplicate_001' },
    });
    expect(messages).toBe(1);
  });
});
