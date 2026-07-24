import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ChannelType } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { hmacSha256, hmacSha256Base64 } from '../test-fixtures/webhook-route-test-helpers.js';
import {
  INSTAGRAM_SECRET,
  SHOPIFY_SECRET,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const { app, queueAddSpy } = webhookFixture;

// Comfortably over the 2 MB signed-webhook budget, comfortably under the 50 MB
// email budget — one payload proves both halves of P4-05.
const OVER_WEBHOOK_BUDGET = JSON.stringify({ padding: 'x'.repeat(3_000_000) });

const SIGNED_WEBHOOK_ROUTES = [
  '/webhooks/telegram',
  '/webhooks/meta',
  '/webhooks/shopify',
  '/webhooks/photon',
  '/webhooks/tiktok-shop',
  '/webhooks/gmail/push',
] as const;

describe('request body budgets', () => {
  beforeEach(() => {
    queueAddSpy.mockClear();
  });

  it.each(SIGNED_WEBHOOK_ROUTES)('rejects an oversized body on %s', async (route) => {
    const res = await request(app)
      .post(route)
      .set('Content-Type', 'application/json')
      .send(OVER_WEBHOOK_BUDGET);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Payload too large' });
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized signed body before verifying its signature', async () => {
    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', hmacSha256Base64(SHOPIFY_SECRET, OVER_WEBHOOK_BUDGET))
      .set('x-shopify-shop-domain', 'test-shop.myshopify.com')
      .set('x-shopify-topic', 'orders/created')
      .send(OVER_WEBHOOK_BUDGET);

    expect(res.status).toBe(413);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized body carrying an invalid signature the same way', async () => {
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', hmacSha256('wrong-secret', OVER_WEBHOOK_BUDGET))
      .send(OVER_WEBHOOK_BUDGET);

    expect(res.status).toBe(413);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('still accepts a body over the webhook budget on the email route', async () => {
    const org = webhookFixture.org;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: `support-${org.id.slice(0, 8)}@example.com`,
    });

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send({
        From: 'Alice <alice@example.com>',
        OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
        Subject: 'Long thread',
        TextBody: 'x'.repeat(3_000_000),
      });

    expect(res.status).toBe(200);
    expect(queueAddSpy).toHaveBeenCalledOnce();
  });

  it('keeps a signature-verifying webhook working under its budget', async () => {
    const payload = JSON.stringify({ object: 'instagram', entry: [] });

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', hmacSha256(INSTAGRAM_SECRET, payload))
      .send(payload);

    expect(res.status).toBe(200);
  });
});
