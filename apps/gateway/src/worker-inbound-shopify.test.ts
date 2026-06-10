import './test-fixtures/worker-test-setup.js';
import { describe, it, expect } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  getCapturedHandlers,
  getMockLogger,
  makeShopifyJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — shopify branch', () => {
  it('creates customer + thread + message for orders/created with customer email', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', { email: 'jane@shop.com', first_name: 'Jane', last_name: 'Doe' }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'jane@shop.com' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('Jane Doe');

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    expect(thread).not.toBeNull();
    expect(thread?.tag).toBe('Order Status');

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message?.contentText).toBe('New order #1001 was placed.');
  });

  it('creates message with correct text for orders/fulfilled', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/fulfilled', { email: 'bob@shop.com' }));

    const customer = await db.customer.findFirst({ where: { organizationId: org.id, platformId: 'bob@shop.com' } });
    const thread = await db.thread.findFirst({ where: { customerId: customer!.id } });
    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message?.contentText).toBe('Order #1001 has been fulfilled.');
  });

  it('uses shopify_${id} as platformId when customer has no email', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', { id: 99999, first_name: 'No Email' }));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify_99999' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('No Email');
  });

  it('drops the event when customer has neither email nor id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/created', null));

    const threads = await db.thread.findMany({
      where: { organizationId: org.id, channelType: ChannelType.shopify },
    });
    expect(threads).toHaveLength(0);
    expect(getMockLogger().warn).toHaveBeenCalledWith(
      { traceId: 'trace-shopify-test' },
      '[Worker] Shopify order missing customer identity — dropping',
    );
  });

  it('adds a new message to the existing thread for a returning customer', async () => {
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'repeat@shop.com', name: 'Repeat Buyer' },
    });
    const existingThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.shopify,
        status: 'open',
        tag: 'Order Status',
      },
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeShopifyJob(org.id, 'orders/fulfilled', { email: 'repeat@shop.com' }));

    const customerCount = await db.customer.count({
      where: { organizationId: org.id, platformId: 'repeat@shop.com' },
    });
    expect(customerCount).toBe(1);

    const messageCount = await db.message.count({ where: { threadId: existingThread.id } });
    expect(messageCount).toBe(1);
  });

  it('keeps repeated identical Shopify events distinct when no webhook id is available', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const job = makeShopifyJob(org.id, 'orders/updated', { email: 'shopify-no-id@example.com' });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify-no-id@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Order #1001 has been updated.', externalMessageId: null },
      { contentText: 'Order #1001 has been updated.', externalMessageId: null },
    ]);
  });

  it('deduplicates Shopify provider retries with the same webhook id', async () => {
    const handler = getCapturedHandlers().get('inbound-messages');
    const externalMessageId = 'shopify:retry-shop.myshopify.com:duplicate-webhook-001';
    const job = makeShopifyJob(
      org.id,
      'orders/created',
      { email: 'shopify-duplicate@example.com' },
      {},
      { inboundMessageId: externalMessageId },
    );

    await handler!(job);
    await handler!(job);

    const messageCount = await db.message.count({ where: { externalMessageId } });
    expect(messageCount).toBe(1);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'shopify-duplicate@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.shopify },
    });
    const messagesForThread = await db.message.count({ where: { threadId: thread!.id } });
    expect(messagesForThread).toBe(1);
  });
});
