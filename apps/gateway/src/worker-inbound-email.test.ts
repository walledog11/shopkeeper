import './test-fixtures/worker-test-setup.js';
import { describe, it, expect } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  classifierResponse,
  getCapturedHandlers,
  getMockAnthropicCreate,
  makeEmailJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — email branch', () => {
  it('persists genuine email with filterStatus + filterDecidedAt set inline', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(
      classifierResponse('genuine', { summary: 'Customer needs shipping help.', tag: 'Shipping' }),
    );

    const handler = getCapturedHandlers().get('inbound-messages');
    expect(handler).toBeDefined();
    await handler!(makeEmailJob(org.id));

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'customer@example.com' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.email },
    });
    expect(thread?.filterStatus).toBe('genuine');
    expect(thread?.filterReason).toBe('Looks genuine.');
    expect(thread?.filterDecidedAt).not.toBeNull();
    expect(thread?.aiSummary).toBe('Customer needs shipping help.');
    expect(thread?.tag).toBe('Shipping');
  });

  it('persists spam as filtered', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(classifierResponse('filtered', { reason: 'Promotional newsletter.' }));

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread?.filterStatus).toBe('filtered');
    expect(thread?.filterReason).toBe('Promotional newsletter.');
  });

  it('persists ambiguous email as questionable', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(classifierResponse('questionable', { reason: 'Cold pitch — unclear if real customer.' }));

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread?.filterStatus).toBe('questionable');
    expect(thread?.filterReason).toBe('Cold pitch — unclear if real customer.');
  });

  it('skips classifier and inherits status when customer already has an open thread', async () => {
    const existingCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'customer@example.com', name: 'Test Customer' },
    });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existingCustomer.id,
        channelType: ChannelType.email,
        status: 'open',
      },
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(getMockAnthropicCreate()).not.toHaveBeenCalled();
  });

  it('skips classifier when customer has a prior genuine thread (existing-customer bypass)', async () => {
    const existing = await db.customer.create({
      data: { organizationId: org.id, platformId: 'customer@example.com', name: 'Existing' },
    });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: existing.id,
        channelType: ChannelType.email,
        status: 'closed',
        filterStatus: 'genuine',
        filterDecidedAt: new Date(),
      },
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(getMockAnthropicCreate()).not.toHaveBeenCalled();

    const newThread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: existing.id, status: 'open', channelType: ChannelType.email },
    });
    expect(newThread?.filterStatus).toBe('genuine');
    expect(newThread?.filterReason).toBe('Existing customer with prior genuine thread');
  });

  it('skips classifier when spamFilterEnabled is false (kill switch)', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { spamFilterEnabled: false } },
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    expect(getMockAnthropicCreate()).not.toHaveBeenCalled();

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread?.filterStatus).toBe('genuine');
    expect(thread?.filterReason).toBe('Spam filter disabled');
    expect(thread?.filterDecidedAt).not.toBeNull();
  });

  it('does not classify non-email threads (Shopify order events stay genuine)', async () => {
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('filtered', { reason: 'system alert' }));

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'shop_customer@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.shopify, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'New order #1001 was placed.' },
    });

    const aiHandler = getCapturedHandlers().get('ai-summary');
    await aiHandler!({
      id: 'ai-job-shopify',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: 'Shop Customer',
        channelType: ChannelType.shopify,
        traceId: 'trace-shopify',
      },
    });

    const after = await db.thread.findUnique({ where: { id: thread.id } });
    expect(after?.filterStatus).toBe('genuine');
    expect(after?.filterDecidedAt).toBeNull();
  });

  it('preserves genuine lock through SUMMARIZE_THREAD when kill switch is on', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { settings: { spamFilterEnabled: false } },
    });
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('filtered', { reason: 'spammy' }));

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeEmailJob(org.id));

    const thread = await db.thread.findFirst({ where: { organizationId: org.id, channelType: ChannelType.email } });
    expect(thread).not.toBeNull();

    const aiHandler = getCapturedHandlers().get('ai-summary');
    await aiHandler!({
      id: 'ai-job-killswitch',
      data: {
        threadId: thread!.id,
        organizationId: org.id,
        customerName: 'Test Customer',
        channelType: ChannelType.email,
        traceId: 'trace-killswitch',
      },
    });

    const after = await db.thread.findUnique({ where: { id: thread!.id } });
    expect(after?.filterStatus).toBe('genuine');
    expect(after?.filterReason).toBe('Spam filter disabled');
  });

  it('deduplicates messages with the same externalMessageId', async () => {
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('genuine'));

    const handler = getCapturedHandlers().get('inbound-messages');
    const job = makeEmailJob(org.id, { inboundMessageId: 'duplicate-mid-001' });

    await handler!(job);
    await handler!(job);

    const messageCount = await db.message.count({
      where: { organizationId: org.id, externalMessageId: 'duplicate-mid-001' },
    });
    expect(messageCount).toBe(1);
  });

  it('rejects duplicate externalMessageId rows within one organization at the database boundary', async () => {
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'db-duplicate@example.com' },
    });
    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.email,
        status: 'open',
      },
    });
    const externalMessageId = 'db-duplicate-mid-001';

    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: 'customer',
        contentText: 'First copy',
        externalMessageId,
      },
    });

    await expect(db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: 'customer',
        contentText: 'Second copy',
        externalMessageId,
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same externalMessageId across different organizations', async () => {
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('genuine'));

    const handler = getCapturedHandlers().get('inbound-messages');
    const otherOrg = await createTestOrg();
    const sharedExternalId = 'shared-message-id-across-orgs';

    try {
      await handler!(makeEmailJob(org.id, { inboundMessageId: sharedExternalId }));
      await handler!(makeEmailJob(otherOrg.id, {
        inboundMessageId: sharedExternalId,
        senderEmail: 'other-org-customer@example.com',
      }));

      expect(await db.message.count({
        where: { organizationId: org.id, externalMessageId: sharedExternalId },
      })).toBe(1);
      expect(await db.message.count({
        where: { organizationId: otherOrg.id, externalMessageId: sharedExternalId },
      })).toBe(1);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('keeps repeated identical emails distinct when Postmark omits Message-ID', async () => {
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('genuine'));

    const handler = getCapturedHandlers().get('inbound-messages');
    const job = makeEmailJob(org.id, {
      senderEmail: 'missing-message-id@example.com',
      inboundMessageId: null,
      body: 'Same text sent twice.',
    });

    await handler!(job);
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'missing-message-id@example.com' },
    });
    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.email },
    });
    const messages = await db.message.findMany({
      where: { threadId: thread!.id },
      orderBy: { sentAt: 'asc' },
      select: { contentText: true, externalMessageId: true },
    });

    expect(messages).toEqual([
      { contentText: 'Same text sent twice.', externalMessageId: null },
      { contentText: 'Same text sent twice.', externalMessageId: null },
    ]);
  });
});
