import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegisteredWebhookRouterApp } from '../test-fixtures/webhook-route-test-helpers.js';

const { mockLogger, mockQueueAdd, mockResolveIntegration } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockQueueAdd: vi.fn(),
  mockResolveIntegration: vi.fn(),
}));

vi.mock('../logger.js', () => ({ default: mockLogger }));
vi.mock('./webhooks-shared.js', () => ({
  getRateLimitRedis: () => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
  getMessageQueue: () => ({ add: mockQueueAdd }),
}));
vi.mock('../lib/instagram-integration.js', () => ({
  resolveSocialApiIntegration: mockResolveIntegration,
}));

import { registerSocialApiWebhookRoutes } from './webhooks-socialapi.js';

const SECRET = 'test-socialapi-webhook-secret';
const CONNECTED_ACCOUNT = 'acc_connected';
const app = createRegisteredWebhookRouterApp(registerSocialApiWebhookRoutes);

function signedRequest(body: string, timestamp = `${Math.floor(Date.now() / 1_000)}`) {
  const signature = `sha256=${createHmac('sha256', SECRET)
    .update(timestamp)
    .update('.')
    .update(body)
    .digest('hex')}`;
  return request(app)
    .post('/webhooks/socialapi')
    .set('Content-Type', 'application/json')
    .set('X-SocialAPI-Signature-V2', signature)
    .set('X-SocialAPI-Timestamp', timestamp);
}

describe('SocialAPI webhook spike receiver', () => {
  beforeEach(() => {
    process.env.SOCIALAPI_WEBHOOK_SECRET = SECRET;
    mockLogger.debug.mockClear();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockQueueAdd.mockReset();
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });
    mockResolveIntegration.mockReset();
    // Resolve by the account id the payload carries, so a test that changes the
    // account proves the route routed on it rather than on a constant.
    mockResolveIntegration.mockImplementation(async (providerAccountId: string) => (
      providerAccountId === CONNECTED_ACCOUNT
        ? {
          transport: 'socialapi',
          id: 'integration-1',
          organizationId: 'org-1',
          instagramAccountId: '17841400000000000',
          accessToken: null,
        }
        : null
    ));
  });

  afterEach(() => {
    process.env.SOCIALAPI_WEBHOOK_SECRET = SECRET;
  });

  it('accepts only the strict unsigned registration ping while no secret is configured', async () => {
    delete process.env.SOCIALAPI_WEBHOOK_SECRET;

    const accepted = await request(app)
      .post('/webhooks/socialapi')
      .set('Content-Type', 'application/json')
      .set('X-SocialAPI-Event', 'webhook.test')
      .send({ event: 'webhook.test', data: {} });
    const rejected = await request(app)
      .post('/webhooks/socialapi')
      .set('Content-Type', 'application/json')
      .set('X-SocialAPI-Event', 'webhook.test')
      .send({ event: 'webhook.test', data: {}, extra: true });

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(500);
  });

  it('rejects an unsigned real event', async () => {
    const response = await request(app)
      .post('/webhooks/socialapi')
      .set('Content-Type', 'application/json')
      .set('X-SocialAPI-Event', 'dm.received')
      .set('X-SocialAPI-Delivery', 'delivery-1')
      .send({ event: 'dm.received', data: {} });

    expect(response.status).toBe(401);
  });

  it('accepts a signed real event and logs structural, fingerprinted evidence only', async () => {
    const body = JSON.stringify({
      event: 'dm.received',
      data: {
        id: 'interaction-sensitive',
        account_id: 'account-sensitive',
        platform: 'instagram',
        author: { id: 'author-sensitive', name: 'Do not log me' },
        content: {
          text: 'Shopkeeper controlled spike secret message',
          media: [{ type: 'image', url: 'https://private.example/image' }],
        },
        received_at: '2026-09-10T01:18:38Z',
      },
      raw_payload: { secret: 'do-not-log' },
    });

    const response = await signedRequest(body)
      .set('X-SocialAPI-Event', 'dm.received')
      .set('X-SocialAPI-Delivery', 'delivery-sensitive')
      .send(body);

    expect(response.status).toBe(200);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'dm.received',
        deliveryId: expect.stringMatching(/^sha256:[a-f0-9]{16}$/),
        accountId: expect.stringMatching(/^sha256:[a-f0-9]{16}$/),
        interactionId: expect.stringMatching(/^sha256:[a-f0-9]{16}$/),
        authorId: expect.stringMatching(/^sha256:[a-f0-9]{16}$/),
        platform: 'instagram',
        textPresent: true,
        mediaCount: 1,
        rawPayloadPresent: true,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('secret message');
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('private.example');
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('Do not log me');
  });

  it('rejects stale signatures and signed header/body event mismatches', async () => {
    const staleBody = JSON.stringify({ event: 'dm.received', data: {} });
    const stale = await signedRequest(staleBody, '1700000000')
      .set('X-SocialAPI-Event', 'dm.received')
      .set('X-SocialAPI-Delivery', 'delivery-stale')
      .send(staleBody);

    const mismatchBody = JSON.stringify({ event: 'dm.sent', data: {} });
    const mismatch = await signedRequest(mismatchBody)
      .set('X-SocialAPI-Event', 'dm.received')
      .set('X-SocialAPI-Delivery', 'delivery-mismatch')
      .send(mismatchBody);

    expect(stale.status).toBe(401);
    expect(mismatch.status).toBe(400);
  });

  it('rejects a signed real event without a delivery ID', async () => {
    const body = JSON.stringify({ event: 'dm.sent', data: {} });
    const response = await signedRequest(body)
      .set('X-SocialAPI-Event', 'dm.sent')
      .send(body);

    expect(response.status).toBe(400);
  });

  it('mounts under the signed-webhook body limit', async () => {
    const limitedApp = express();
    limitedApp.use('/webhooks', (() => {
      const router = express.Router();
      registerSocialApiWebhookRoutes(router);
      return router;
    })());

    const response = await request(limitedApp)
      .post('/webhooks/socialapi')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'dm.received', padding: 'x'.repeat(3_000_000) }));

    expect(response.status).toBe(413);
  });
  describe('provider-account ingress', () => {

    function dmReceived(overrides: Record<string, unknown> = {}) {
      return JSON.stringify({
        event: 'dm.received',
        data: {
          id: 'interaction-provider-only',
          account_id: CONNECTED_ACCOUNT,
          conversation_id: 'conv_1',
          platform: 'instagram',
          platform_id: 'native-message-id',
          author: { id: 'author-1' },
          content: { text: 'where is my order', media: [] },
          received_at: '2026-09-10T01:18:38Z',
          ...overrides,
        },
      });
    }

    async function postDmReceived(body: string) {
      return signedRequest(body)
        .set('X-SocialAPI-Event', 'dm.received')
        .set('X-SocialAPI-Delivery', 'delivery-ingress')
        .send(body);
    }

    it('queues a normalized Instagram job for the account it resolves', async () => {
      const response = await postDmReceived(dmReceived());

      expect(response.status).toBe(200);
      expect(mockResolveIntegration).toHaveBeenCalledWith(CONNECTED_ACCOUNT);
      expect(mockQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockQueueAdd).toHaveBeenCalledWith('process-ig-dm', expect.objectContaining({
        platform: 'ig_dm',
        provider: 'socialapi',
        integrationId: 'integration-1',
        organizationId: 'org-1',
        instagramAccountId: '17841400000000000',
        senderIgsid: 'author-1',
        providerConversationId: 'conv_1',
        providerSentAt: '2026-09-10T01:18:38Z',
        text: 'where is my order',
        attachments: [],
      }));
    });

    it('keys deduplication on the native platform_id, never the interaction id', async () => {
      await postDmReceived(dmReceived());

      const job = mockQueueAdd.mock.calls[0]?.[1] as { externalMessageId: string };
      expect(job.externalMessageId).toBe('native-message-id');
      expect(job.externalMessageId).not.toBe('interaction-provider-only');
    });

    it('falls back to the raw Meta message id and sender when normalized fields are absent', async () => {
      const body = JSON.stringify({
        event: 'dm.received',
        data: {
          account_id: CONNECTED_ACCOUNT,
          platform: 'instagram',
          content: { text: 'hello' },
          received_at: '2026-09-10T01:18:38Z',
          raw_payload: { message: { mid: 'raw-mid' }, sender: { id: 'raw-sender' } },
        },
      });
      await postDmReceived(body);

      expect(mockQueueAdd).toHaveBeenCalledWith('process-ig-dm', expect.objectContaining({
        externalMessageId: 'raw-mid',
        senderIgsid: 'raw-sender',
      }));
    });

    it('carries media through as attachments so an image is never silently dropped', async () => {
      await postDmReceived(dmReceived({
        content: { text: null, media: [{ type: 'ephemeral' }, { type: 'image', url: 'https://cdn.example/i' }] },
      }));

      expect(mockQueueAdd).toHaveBeenCalledWith('process-ig-dm', expect.objectContaining({
        text: null,
        attachments: [{ type: 'ephemeral', url: null }, { type: 'image', url: 'https://cdn.example/i' }],
      }));
    });

    it('stays observation-only for an unconnected account and for dm.sent', async () => {
      const otherAccount = await postDmReceived(dmReceived({ account_id: 'acc_other' }));

      const sentBody = JSON.stringify({ event: 'dm.sent', data: { account_id: CONNECTED_ACCOUNT } });
      const sent = await signedRequest(sentBody)
        .set('X-SocialAPI-Event', 'dm.sent')
        .set('X-SocialAPI-Delivery', 'delivery-sent')
        .send(sentBody);

      expect(otherAccount.status).toBe(200);
      expect(sent.status).toBe(200);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('takes the organization from the resolved row, never from the payload', async () => {
      await postDmReceived(dmReceived({ organization_id: 'org-attacker' }));

      expect(mockQueueAdd).toHaveBeenCalledWith('process-ig-dm', expect.objectContaining({
        organizationId: 'org-1',
      }));
    });

    it('drops the event when the account maps to no active SocialAPI row', async () => {
      mockResolveIntegration.mockResolvedValue(null);

      const response = await postDmReceived(dmReceived());

      expect(response.status).toBe(200);
      expect(mockQueueAdd).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns 500 so the vendor retries when queue admission fails', async () => {
      mockQueueAdd.mockRejectedValue(new Error('redis down'));

      const response = await postDmReceived(dmReceived());

      expect(response.status).toBe(500);
    });
  });
});
