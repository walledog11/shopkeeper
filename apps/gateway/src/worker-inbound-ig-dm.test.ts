import './test-fixtures/worker-test-setup.js';
import { describe, it, expect } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  getCapturedHandlers,
  getMockFetch,
  makeIgDmJob,
} from './test-fixtures/worker-test-helpers.js';

describe('Message worker — normalized ig_dm jobs', () => {
  async function createInstagramLoginIntegration(accountId = `ig_account_${org.id}`) {
    return createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: accountId,
      accessToken: 'test-instagram-token',
      metadata: { instagram: { authModel: 'instagram_login' } },
    });
  }

  async function activeJob(
    senderIgsid: string,
    options: {
      attachments?: Array<{ type: string; url: string | null }>;
      messageMid?: string | null;
      providerSentAt?: string;
      text?: string | null;
    } = {},
  ) {
    const integration = await createInstagramLoginIntegration();
    return {
      integration,
      job: makeIgDmJob(org.id, senderIgsid, {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        ...options,
      }),
    };
  }

  it('creates a routed customer, thread, and provider-timestamped message', async () => {
    const { integration, job } = await activeJob('ig_user_new_001', {
      messageMid: 'mid.new',
      providerSentAt: '2026-07-14T12:34:56.000Z',
    });
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_new_001' },
    });
    expect(customer).not.toBeNull();

    const thread = await db.thread.findFirst({
      where: { organizationId: org.id, customerId: customer!.id, channelType: ChannelType.ig_dm },
    });
    expect(thread).toMatchObject({
      status: 'open',
      replyIntegrationId: integration.id,
      replyIntegrationUpdatedAt: new Date('2026-07-14T12:34:56.000Z'),
      lastMessageAt: new Date('2026-07-14T12:34:56.000Z'),
    });

    const message = await db.message.findFirst({ where: { threadId: thread!.id } });
    expect(message).toMatchObject({
      senderType: 'customer',
      contentText: 'Hi, can you help me?',
      externalMessageId: 'mid.new',
      integrationId: integration.id,
      sentAt: new Date('2026-07-14T12:34:56.000Z'),
    });
  });

  it('adds a new message to an existing open thread for a returning sender', async () => {
    const integration = await createInstagramLoginIntegration();
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
    await handler!(makeIgDmJob(org.id, 'ig_returning_001', {
      instagramAccountId: integration.externalAccountId,
      integrationId: integration.id,
    }));

    expect(await db.message.count({ where: { threadId: existingThread.id } })).toBe(1);
    expect(await db.thread.count({
      where: { organizationId: org.id, customerId: existingCustomer.id, channelType: ChannelType.ig_dm },
    })).toBe(1);
  });

  it('deduplicates a Meta mid but keeps missing-mid deliveries distinct', async () => {
    const integration = await createInstagramLoginIntegration();
    const handler = getCapturedHandlers().get('inbound-messages');
    const duplicate = makeIgDmJob(org.id, 'ig_duplicate_sender_001', {
      instagramAccountId: integration.externalAccountId,
      integrationId: integration.id,
      messageMid: 'mid_ig_duplicate_001',
    });
    const withoutMid = makeIgDmJob(org.id, 'ig_duplicate_sender_001', {
      instagramAccountId: integration.externalAccountId,
      integrationId: integration.id,
      messageMid: null,
      text: 'Same IG message sent twice.',
    });

    await handler!(duplicate);
    await handler!(duplicate);
    await handler!(withoutMid);
    await handler!(withoutMid);

    expect(await db.message.count({
      where: { organizationId: org.id, externalMessageId: 'mid_ig_duplicate_001' },
    })).toBe(1);
    expect(await db.message.count({
      where: { organizationId: org.id, externalMessageId: null },
    })).toBe(2);
  });

  it('uses the exact integration token for profile enrichment without persisting the provider image URL', async () => {
    const { job } = await activeJob('ig_user_with_profile');
    getMockFetch().mockResolvedValueOnce(new Response(JSON.stringify({
      name: 'IG User Profile',
      profile_pic: 'https://temporary.cdn.example/profile.jpg',
    }), { status: 200 }));

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    const customer = await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_user_with_profile' },
    });
    expect(customer).toMatchObject({ name: 'IG User Profile', profilePicUrl: null });
    expect(getMockFetch()).toHaveBeenCalledOnce();
    const [url, init] = getMockFetch().mock.calls[0];
    expect(String(url)).toContain('graph.instagram.com/v25.0/ig_user_with_profile');
    expect(init).toMatchObject({
      headers: { Authorization: 'Bearer test-instagram-token' },
    });
  });

  it('records visible placeholders without persisting temporary attachment URLs', async () => {
    const { job } = await activeJob('ig_attachment_sender', {
      text: null,
      attachments: [
        { type: 'image', url: 'https://temporary.cdn.example/image.jpg' },
        { type: 'unsupported', url: null },
      ],
    });
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    const message = await db.message.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(message.contentText).toBe(
      '[Instagram image attachment]\n[Unsupported Instagram message]',
    );
    expect(message.attachments).toEqual([]);
    expect(message.contentText).not.toContain('temporary.cdn.example');
  });

  it('does not let a delayed provider event move thread time or routing backwards', async () => {
    const integration = await createInstagramLoginIntegration();
    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(makeIgDmJob(org.id, 'ig_delayed_sender', {
      instagramAccountId: integration.externalAccountId,
      integrationId: integration.id,
      messageMid: 'mid.newer',
      providerSentAt: '2026-07-14T13:00:00.000Z',
      text: 'Newer',
    }));
    await handler!(makeIgDmJob(org.id, 'ig_delayed_sender', {
      instagramAccountId: integration.externalAccountId,
      integrationId: integration.id,
      messageMid: 'mid.older',
      providerSentAt: '2026-07-14T12:00:00.000Z',
      text: 'Delayed older event',
    }));

    const thread = await db.thread.findFirstOrThrow({
      where: { organizationId: org.id, channelType: ChannelType.ig_dm },
    });
    expect(thread.lastMessageAt).toEqual(new Date('2026-07-14T13:00:00.000Z'));
    expect(thread.replyIntegrationId).toBe(integration.id);
    expect(thread.replyIntegrationUpdatedAt).toEqual(new Date('2026-07-14T13:00:00.000Z'));
  });

  it('drops a queued message if its integration was disconnected or replaced', async () => {
    const { integration, job } = await activeJob('ig_disconnected_sender');
    await db.integration.delete({ where: { id: integration.id } });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    expect(await db.customer.findFirst({
      where: { organizationId: org.id, platformId: 'ig_disconnected_sender' },
    })).toBeNull();
  });
});
