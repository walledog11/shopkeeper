import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ChannelType, db } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { hmacSha256Base64 } from '../test-fixtures/webhook-route-test-helpers.js';
import {
  SHOPIFY_SECRET,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const { app, mockLogger, queueAddSpy } = webhookFixture;
let org: { id: string };
let postmarkIntegration: { id: string };

beforeEach(async () => {
  org = webhookFixture.org;
  postmarkIntegration = await createTestIntegration(org.id, {
    platform: ChannelType.email,
    externalAccountId: `support-${org.id.slice(0, 8)}@example.com`,
  });
});

describe('POST /webhooks/email/inbound', () => {
  it('enqueues an email job when routing by org UUID in recipient address', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
      To: 'Support Team <support@example.com>',
      Subject: 'Help please',
      TextBody: 'I need assistance.',
    };

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = queueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-email');
    expect(jobData).toMatchObject({
      platform: 'email',
      organizationId: org.id,
      integrationId: postmarkIntegration.id,
      senderEmail: 'alice@example.com',
      subject: 'Help please',
    });
  });

  it('uses OriginalRecipient for tenancy and ignores the visible To header', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@acme.com`;

    const payload = {
      From: 'Bob <bob@example.com>',
      To: emailAddress,
      OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
      Subject: 'Order issue',
      TextBody: 'My order is wrong.',
    };

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send(payload);

    expect(res.status).toBe(200);
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [, jobData] = queueAddSpy.mock.calls[0];
    expect(jobData).toMatchObject({ organizationId: org.id, senderEmail: 'bob@example.com' });
  });

  it('drops (200) when no org or integration matches the recipient address', async () => {
    const payload = {
      From: 'Spam <x@y.com>',
      To: 'nobody@unknown.com',
      OriginalRecipient: 'nobody@unknown.com',
      Subject: 'Nope',
      TextBody: 'test',
    };

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send(payload);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when From or TextBody is missing', async () => {
    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send({ To: `${org.id}@inbound.shopkeeper.delivery` });

    expect(res.status).toBe(400);
  });

  it('forwards Postmark Attachments through to the queued job', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
      To: 'support@example.com',
      Subject: 'See attached',
      TextBody: 'Here is the photo.',
      Attachments: [
        {
          Name: 'photo.png',
          Content: Buffer.from('fake-png-bytes').toString('base64'),
          ContentType: 'image/png',
          ContentLength: 14,
        },
      ],
    };

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send(payload);

    expect(res.status).toBe(200);
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [, jobData] = queueAddSpy.mock.calls[0];
    expect(jobData.attachments).toHaveLength(1);
    expect(jobData.attachments[0]).toMatchObject({
      name: 'photo.png',
      contentType: 'image/png',
    });
    expect(jobData.attachments[0].contentBase64).toBe(payload.Attachments[0].Content);
  });

  describe('basic auth', () => {
    afterEach(() => {
      delete process.env.POSTMARK_INBOUND_USERNAME;
      delete process.env.POSTMARK_INBOUND_PASSWORD;
    });

    it('returns 401 when credentials are configured and the request has no Authorization header', async () => {
      process.env.POSTMARK_INBOUND_USERNAME = 'postmark';
      process.env.POSTMARK_INBOUND_PASSWORD = 'secret';

      const res = await request(app)
        .post('/webhooks/email/inbound')
        .send({ From: 'a@x.com', To: `${org.id}@inbound.shopkeeper.delivery`, TextBody: 'hi' });

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
      expect(queueAddSpy).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Webhook] Inbound email rejected — invalid or missing basic auth',
      );
    });

    it('returns 401 when credentials are configured and the Authorization header is wrong', async () => {
      process.env.POSTMARK_INBOUND_USERNAME = 'postmark';
      process.env.POSTMARK_INBOUND_PASSWORD = 'secret';

      const res = await request(app)
        .post('/webhooks/email/inbound')
        .set('Authorization', `Basic ${Buffer.from('postmark:wrong').toString('base64')}`)
        .send({ From: 'a@x.com', To: `${org.id}@inbound.shopkeeper.delivery`, TextBody: 'hi' });

      expect(res.status).toBe(401);
      expect(queueAddSpy).not.toHaveBeenCalled();
    });

    it('accepts requests with the correct credentials', async () => {
      process.env.POSTMARK_INBOUND_USERNAME = 'postmark';
      process.env.POSTMARK_INBOUND_PASSWORD = 'secret';

      const res = await request(app)
        .post('/webhooks/email/inbound')
        .set('Authorization', `Basic ${Buffer.from('postmark:secret').toString('base64')}`)
        .send({
          From: 'Alice <a@x.com>',
          OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
          To: 'support@example.com',
          Subject: 'Hi',
          TextBody: 'hi',
        });

      expect(res.status).toBe(200);
      expect(queueAddSpy).toHaveBeenCalledOnce();
    });

    it('returns 401 in production when inbound basic auth credentials are not configured', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .post('/webhooks/email/inbound')
          .send({ From: 'a@x.com', To: `${org.id}@inbound.shopkeeper.delivery`, TextBody: 'hi' });

        expect(res.status).toBe(401);
        expect(queueAddSpy).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  it('omits attachments from the queued job when Postmark sends none', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      OriginalRecipient: `${org.id}@inbound.shopkeeper.delivery`,
      To: 'support@example.com',
      Subject: 'No attachments',
      TextBody: 'Just text.',
    };

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send(payload);

    expect(res.status).toBe(200);
    const [, jobData] = queueAddSpy.mock.calls[0];
    expect(jobData.attachments).toBeUndefined();
  });

  it('acknowledges a disconnected forwarding recipient without queueing or logging PII', async () => {
    const recipient = `${org.id}@inbound.shopkeeper.delivery`;
    await db.integration.delete({ where: { id: postmarkIntegration.id } });

    const res = await request(app)
      .post('/webhooks/email/inbound')
      .send({
        From: 'Alice <alice@example.com>',
        OriginalRecipient: recipient,
        To: 'support@example.com',
        TextBody: 'Hello',
      });

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'unclaimed_recipient',
        recipientDomain: 'inbound.shopkeeper.delivery',
        recipientHash: expect.any(String),
      }),
      '[Webhook] Unclaimed Postmark recipient acknowledged',
    );
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain(recipient);
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/shopify — Shopify order event ingestion
// ---------------------------------------------------------------------------
describe('POST /webhooks/shopify', () => {
  it('enqueues a shopify job when HMAC is valid and integration exists', async () => {
    const shopDomain = `shop-${org.id.slice(0, 8)}.myshopify.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });

    const payload = { name: '#1001', order_number: 1001, customer: { email: 'customer@shop.com' } };
    const body = JSON.stringify(payload);
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'orders/created')
      .set('x-shopify-shop-domain', shopDomain)
      .set('x-shopify-webhook-id', 'webhook-1001')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = queueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-shopify-order');
    expect(jobData).toMatchObject({
      platform: 'shopify',
      organizationId: org.id,
      topic: 'orders/created',
      inboundMessageId: `shopify:${shopDomain}:webhook-1001`,
    });
  });

  it('returns 401 when signature header is missing', async () => {
    const body = JSON.stringify({ name: '#1002', customer: { email: 'x@x.com' } });

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-topic', 'orders/created')
      .set('x-shopify-shop-domain', 'shop.myshopify.com')
      .send(body);

    expect(res.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Webhook] Shopify missing signature or raw body — rejecting.',
    );
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ name: '#1003', customer: { email: 'x@x.com' } });

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', 'wrongsig')
      .set('x-shopify-topic', 'orders/created')
      .set('x-shopify-shop-domain', 'shop.myshopify.com')
      .send(body);

    expect(res.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Shopify signature mismatch — rejecting.');
  });

  it('silently drops (200) unsupported topics', async () => {
    const body = JSON.stringify({ id: 'product_001' });
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'products/create')
      .set('x-shopify-shop-domain', 'shop.myshopify.com')
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('silently drops (200) when no integration matches the shop domain', async () => {
    const body = JSON.stringify({ name: '#1004', customer: { email: 'x@x.com' } });
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'orders/created')
      .set('x-shopify-shop-domain', 'unknown-shop.myshopify.com')
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when shop domain header is missing', async () => {
    const body = JSON.stringify({ name: '#1005', customer: { email: 'x@x.com' } });
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'orders/created')
      .send(body);

    expect(res.status).toBe(400);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('deletes the integration on app/uninstalled', async () => {
    const shopDomain = `shop-uninst-${org.id.slice(0, 8)}.myshopify.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });

    const body = JSON.stringify({ id: 12345, name: 'My Shop', domain: shopDomain });
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'app/uninstalled')
      .set('x-shopify-shop-domain', shopDomain)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(queueAddSpy).not.toHaveBeenCalled();
    const after = await db.integration.findUnique({ where: { id: integration.id } });
    expect(after).toBeNull();
  });

  it('returns 200 (no-op) on app/uninstalled when no integration matches', async () => {
    const body = JSON.stringify({ id: 99999, name: 'Ghost', domain: 'ghost.myshopify.com' });
    const sig = hmacSha256Base64(SHOPIFY_SECRET, body);

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', sig)
      .set('x-shopify-topic', 'app/uninstalled')
      .set('x-shopify-shop-domain', 'ghost.myshopify.com')
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('rejects app/uninstalled with bad HMAC', async () => {
    const shopDomain = `shop-bad-${org.id.slice(0, 8)}.myshopify.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
    });

    const body = JSON.stringify({ id: 1, domain: shopDomain });

    const res = await request(app)
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('x-shopify-hmac-sha256', 'wrongsig')
      .set('x-shopify-topic', 'app/uninstalled')
      .set('x-shopify-shop-domain', shopDomain)
      .send(body);

    expect(res.status).toBe(401);
    const still = await db.integration.findUnique({ where: { id: integration.id } });
    expect(still).not.toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Shopify signature mismatch — rejecting.');
  });
});
