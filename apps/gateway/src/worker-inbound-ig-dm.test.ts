import './test-fixtures/worker-test-setup.js';
import { describe, it, expect, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  getCapturedHandlers,
  getMockFetch,
  makeIgDmJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — ig_dm branch', () => {
  it('creates customer + thread + message for a new IG DM', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_user_new_001'));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_new_001' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    expect(thread).not.toBeNull();
    expect(thread?.status).toBe('open');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message).not.toBeNull();
    expect(message?.senderType).toBe('customer');
    expect(message?.contentText).toBe('Hi, can you help me?');
  });

  it('adds a new message to an existing open thread for a returning sender', async () => {
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'ig_returning_001' },
    });
    const existingThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.ig_dm,
        status: 'open',
      },
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_returning_001'));

    const messageCount = await db.message.count({ where: { threadId: existingThread.id } });
    expect(messageCount).toBe(1);

    const threadCount = await db.thread.count({
      where: { organizationId: org.id, customerId: existingCustomer.id, channelType: ChannelType.ig_dm },
    });
    expect(threadCount).toBe(1);
  });

  it('skips duplicate IG DMs with the same Meta message id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const senderId = 'ig_duplicate_sender_001';
    const messageMid = 'mid_ig_duplicate_001';
    const job = makeIgDmJob(org.id, senderId, { messageMid });

    await handler!(job);
    await handler!(job);

    const customerCount = await db.customer.count({
      where: { organizationId: org.id, platformId: senderId },
    });
    expect(customerCount).toBe(1);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: senderId },
    });
    expect(customer).not.toBeNull();

    const threadCount = await db.thread.count({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    expect(threadCount).toBe(1);

    const messageCount = await db.message.count({
      where: { externalMessageId: messageMid },
    });
    expect(messageCount).toBe(1);

    const messagesForSender = await db.message.count({
      where: {
        thread: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
      },
    });
    expect(messagesForSender).toBe(1);
  });

  it('keeps repeated identical IG DMs distinct when Meta omits message id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const senderId = 'ig_missing_mid_sender_001';
    const job = makeIgDmJob(org.id, senderId, {
      messageMid: null,
      text: 'Same IG message sent twice.',
    });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: senderId },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Same IG message sent twice.', externalMessageId: null },
      { contentText: 'Same IG message sent twice.', externalMessageId: null },
    ]);
  });

  it('fetches IG profile when integration has an access token', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: 'page_123',
      accessToken: 'test-ig-token',
    });

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ name: 'IG User Profile', profile_pic: null }),
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_user_with_profile'));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_with_profile' },
    });
    expect(customer?.name).toBe('IG User Profile');
    const graphCalls = getMockFetch().mock.calls.filter(([url]) =>
      String(url).includes('graph.facebook.com'),
    );
    expect(graphCalls).toHaveLength(1);
    expect(String(graphCalls[0][0])).toContain('graph.facebook.com');
  });

  it('drops echo messages without creating DB records', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!({
      id: 'job-echo',
      data: {
        platform: 'ig_dm',
        organizationId: org.id,
        rawPayload: {
          entry: [
            {
              messaging: [
                {
                  sender: { id: 'page_123' },
                  message: { text: 'Echo', is_echo: true },
                },
              ],
            },
          ],
        },
      },
    });

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'page_123' },
    });
    expect(customer).toBeNull();
  });
});
