import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ChannelType } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { hmacSha256 } from '../test-fixtures/webhook-route-test-helpers.js';
import { webhookFixture } from '../test-fixtures/webhook-routes-test-fixture.js';

const { app, mockLogger, queueAddSpy } = webhookFixture;
let org: { id: string };

beforeEach(() => {
  org = webhookFixture.org;
  process.env.TIKTOK_SHOP_ENABLED = 'true';
  process.env.TIKTOK_SHOP_WEBHOOK_SECRET = 'tts-webhook-secret';
  process.env.TIKTOK_SHOP_WEBHOOK_SIGNATURE_PREFIX = 'sha256=';
});

afterEach(() => {
  delete process.env.TIKTOK_SHOP_ENABLED;
  delete process.env.TIKTOK_SHOP_WEBHOOK_SECRET;
  delete process.env.TIKTOK_SHOP_WEBHOOK_SIGNATURE_PREFIX;
});

describe('POST /webhooks/tiktok-shop', () => {
  it('enqueues a TikTok Shop inbound job when signature is valid and integration exists', async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: 'shop_123',
    });
    const payload = {
      event_type: 'buyer_message.created',
      shop_id: 'shop_123',
      data: {
        conversation_id: 'conversation_123',
        buyer_id: 'buyer_123',
        message_id: 'message_123',
        text: 'Where is my order?',
        sender_type: 'buyer',
      },
    };
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/webhooks/tiktok-shop')
      .set('Content-Type', 'application/json')
      .set('x-tts-signature', hmacSha256('tts-webhook-secret', body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = queueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-tiktok-shop-message');
    expect(jobData).toMatchObject({
      platform: 'tiktok',
      organizationId: org.id,
      inboundMessageId: 'tiktok:shop_123:message_123',
    });
  });

  it('returns 401 when signature is invalid', async () => {
    const payload = {
      shop_id: 'shop_123',
      data: { conversation_id: 'conversation_123', buyer_id: 'buyer_123', text: 'Hi' },
    };

    const res = await request(app)
      .post('/webhooks/tiktok-shop')
      .set('Content-Type', 'application/json')
      .set('x-tts-signature', 'sha256=bad')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] TikTok Shop signature mismatch — rejecting.');
  });

  it('drops valid buyer messages when no integration matches the shop id', async () => {
    const payload = {
      shop_id: 'unknown_shop',
      data: { conversation_id: 'conversation_123', buyer_id: 'buyer_123', message_id: 'message_456', text: 'Hi' },
    };
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/webhooks/tiktok-shop')
      .set('Content-Type', 'application/json')
      .set('x-tts-signature', hmacSha256('tts-webhook-secret', body))
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });
});
