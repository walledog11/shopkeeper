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

  it('downloads supported Meta media into private blob storage', async () => {
    const { job } = await activeJob('ig_media_sender', {
      text: null,
      attachments: [{
        type: 'image',
        url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123',
      }],
    });
    getMockFetch()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Media Sender' }), {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(Buffer.from('image bytes'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }));

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    const message = await db.message.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(message.contentText).toBe('[Instagram image attachment]');
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]).toMatch(
      new RegExp(`^blob:attachments/${org.id}/[0-9a-f-]+/instagram-image.jpg$`),
    );
    expect(message.attachments[0]).not.toContain('lookaside.fbsbx.com');
  });

  it('keeps public Instagram share links without storing temporary provider URLs', async () => {
    const { job } = await activeJob('ig_share_sender', {
      text: null,
      attachments: [
        { type: 'share', url: 'https://www.instagram.com/p/example/' },
        { type: 'reel', url: 'https://www.instagram.com/reel/example/' },
        { type: 'story_mention', url: 'https://temporary.cdn.example/story' },
      ],
    });

    const handler = getCapturedHandlers().get('inbound-messages');
    await handler!(job);

    const message = await db.message.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(message.contentText).toBe([
      'Shared Instagram content: https://www.instagram.com/p/example/',
      'Shared Instagram reel: https://www.instagram.com/reel/example/',
      '[Instagram story mention]',
    ].join('\n'));
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
  describe('SocialAPI transport', () => {
    async function createSocialApiIntegration() {
      return createTestIntegration(org.id, {
        platform: ChannelType.ig_dm,
        externalAccountId: `ig_socialapi_${org.id}`,
        accessToken: null,
        metadata: { instagram: { authModel: 'socialapi', transport: 'socialapi' } },
      });
    }

    it('persists a SocialAPI DM without calling Meta for a token it does not have', async () => {
      const integration = await createSocialApiIntegration();
      const fetchCallsBefore = getMockFetch().mock.calls.length;

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_author_1', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
        providerConversationId: 'conv_1',
        messageMid: 'native.mid.1',
        text: 'where is my order',
      }));

      const customer = await db.customer.findFirstOrThrow({
        where: { organizationId: org.id, platformId: 'socialapi_author_1' },
      });
      const thread = await db.thread.findFirstOrThrow({
        where: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.ig_dm },
      });
      const message = await db.message.findFirstOrThrow({ where: { threadId: thread.id } });

      expect(message).toMatchObject({
        senderType: 'customer',
        contentText: 'where is my order',
        externalMessageId: 'native.mid.1',
        integrationId: integration.id,
      });
      expect(thread.replyIntegrationId).toBe(integration.id);
      // Meta profile enrichment and media download both need a Meta token a
      // SocialAPI row cannot hold, and SocialAPI's own enrichment is off with no
      // workspace key, so this path still makes no outbound call at all.
      expect(getMockFetch().mock.calls.length).toBe(fetchCallsBefore);
    });

    function socialApiConversationsResponse(
      conversations: Array<Record<string, unknown>>,
    ) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          data: conversations.map(conversation => ({
            platform: 'instagram',
            account_id: 'acct_1',
            platform_id: 'ig_conv_platform_1',
            last_message_at: '2026-09-12T00:00:00.000Z',
            status: 'open',
            ...conversation,
          })),
          pagination: { has_more: false, next_cursor: null },
        }),
      };
    }

    it('names the customer from the SocialAPI conversation participant', async () => {
      const integration = await createSocialApiIntegration();
      vi.stubEnv('SOCIALAPI_API_KEY', 'test-socialapi-key');
      getMockFetch().mockResolvedValue(socialApiConversationsResponse([
        {
          id: 'conv_named',
          participant_id: 'socialapi_author_named',
          participant_name: 'thecasemrkt',
          participant_picture: 'https://cdn.example.com/avatar.jpg',
        },
      ]));

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_author_named', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
        providerConversationId: 'conv_named',
        messageMid: 'native.mid.named',
        text: 'do you ship to canada',
      }));

      const customer = await db.customer.findFirstOrThrow({
        where: { organizationId: org.id, platformId: 'socialapi_author_named' },
      });
      expect(customer.name).toBe('thecasemrkt');
      // The participant picture is a temporary signed CDN URL, so enrichment
      // reads the name and leaves the avatar to the Blob download path.
      expect(customer.profilePicUrl).toBeNull();
    });

    it('refuses a name whose conversation participant is a different sender', async () => {
      const integration = await createSocialApiIntegration();
      vi.stubEnv('SOCIALAPI_API_KEY', 'test-socialapi-key');
      getMockFetch().mockResolvedValue(socialApiConversationsResponse([
        {
          id: 'conv_mismatch',
          participant_id: 'some_other_shopper',
          participant_name: 'someone_else',
        },
      ]));

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_author_mismatch', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
        providerConversationId: 'conv_mismatch',
        messageMid: 'native.mid.mismatch',
        text: 'hello',
      }));

      const customer = await db.customer.findFirstOrThrow({
        where: { organizationId: org.id, platformId: 'socialapi_author_mismatch' },
      });
      expect(customer.name).toBeNull();
    });

    it('still persists the DM when SocialAPI enrichment fails', async () => {
      const integration = await createSocialApiIntegration();
      vi.stubEnv('SOCIALAPI_API_KEY', 'test-socialapi-key');
      getMockFetch().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => ({ error: { code: 'unavailable', message: 'down' } }),
      });

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_author_unnamed', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
        providerConversationId: 'conv_unnamed',
        messageMid: 'native.mid.unnamed',
        text: 'where is my order',
      }));

      const customer = await db.customer.findFirstOrThrow({
        where: { organizationId: org.id, platformId: 'socialapi_author_unnamed' },
      });
      expect(customer.name).toBeNull();
      const thread = await db.thread.findFirstOrThrow({
        where: { organizationId: org.id, customerId: customer.id },
      });
      const message = await db.message.findFirstOrThrow({ where: { threadId: thread.id } });
      expect(message.contentText).toBe('where is my order');
    });

    it('represents media it cannot yet fetch instead of dropping the message', async () => {
      const integration = await createSocialApiIntegration();

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_author_2', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
        messageMid: 'native.mid.2',
        text: null,
        attachments: [{ type: 'ephemeral', url: null }],
      }));

      const customer = await db.customer.findFirstOrThrow({
        where: { organizationId: org.id, platformId: 'socialapi_author_2' },
      });
      const thread = await db.thread.findFirstOrThrow({
        where: { organizationId: org.id, customerId: customer.id },
      });
      const message = await db.message.findFirstOrThrow({ where: { threadId: thread.id } });

      expect(message.contentText).toBe('[Instagram ephemeral attachment]');
    });

    it('refuses a SocialAPI job that points at a direct Meta row', async () => {
      const integration = await createInstagramLoginIntegration(`ig_direct_guard_${org.id}`);

      const handler = getCapturedHandlers().get('inbound-messages');
      await handler!(makeIgDmJob(org.id, 'socialapi_wrong_transport', {
        instagramAccountId: integration.externalAccountId,
        integrationId: integration.id,
        provider: 'socialapi',
      }));

      expect(await db.customer.findFirst({
        where: { organizationId: org.id, platformId: 'socialapi_wrong_transport' },
      })).toBeNull();
    });
  });
});
