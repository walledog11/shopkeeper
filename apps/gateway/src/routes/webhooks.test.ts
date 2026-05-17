import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHmac } from 'crypto';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestIntegration,
  createTestThread,
  cleanupTestData,
} from '@clerk/db/test-helpers';

// Mock ioredis and bullmq so the webhook module doesn't open live Redis connections.
// We spy on Queue.add to confirm the right job was enqueued.
const { queueAddSpy } = vi.hoisted(() => ({
  queueAddSpy: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn().mockReturnThis();
    this.disconnect = vi.fn();
    this.quit = vi.fn().mockResolvedValue('OK');
    this.status = 'ready';
    this.incr = vi.fn().mockResolvedValue(1);
    this.expire = vi.fn().mockResolvedValue(1);
  }),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = queueAddSpy;
    this.close = vi.fn();
  }),
  Worker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
  }),
}));

// Import the router after mocks are hoisted
import webhookRoutes from './webhooks.js';

function createApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
  app.use('/webhooks', webhookRoutes);
  return app;
}

function hmacSha256(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function hmacSha256Base64(secret: string, body: Buffer | string) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

const META_SECRET = process.env.META_APP_SECRET!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN!;
const SHOPIFY_SECRET = process.env.SHOPIFY_APP_SECRET!;

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const app = createApp();

beforeEach(async () => {
  org = await createTestOrg();
  queueAddSpy.mockClear();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

// ---------------------------------------------------------------------------
// GET /webhooks/meta — Meta verification handshake
// ---------------------------------------------------------------------------
describe('GET /webhooks/meta', () => {
  it('returns 200 and echoes the challenge when token matches', async () => {
    const res = await request(app)
      .get('/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'abc123' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('returns 403 when token does not match', async () => {
    const res = await request(app)
      .get('/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when mode or token are missing', async () => {
    const res = await request(app).get('/webhooks/meta');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/meta — Instagram DM ingestion
// ---------------------------------------------------------------------------
describe('POST /webhooks/meta', () => {
  it('enqueues an ig_dm job when HMAC is valid and integration exists', async () => {
    const igPageId = `ig_page_${org.id.slice(0, 8)}`;
    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: igPageId,
    });

    const payload = {
      object: 'instagram',
      entry: [
        {
          id: igPageId,
          messaging: [
            {
              sender: { id: 'sender_123' },
              message: { text: 'Hello!', mid: 'mid.test001' },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(META_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('EVENT_RECEIVED');
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = queueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-ig-dm');
    expect(jobData).toMatchObject({ platform: 'ig_dm', organizationId: org.id });
  });

  it('returns 401 when HMAC signature is invalid', async () => {
    const payload = { object: 'instagram', entry: [{ id: 'page123', messaging: [{ message: {} }] }] };
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=badsig')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(401);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('drops (200) when no integration is found for the page id', async () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'unknown_page_id',
          messaging: [{ sender: { id: 'abc' }, message: { text: 'hi' } }],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(META_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('enqueues echo events (echo filtering happens in the worker, not the webhook handler)', async () => {
    const igPageId = `ig_page_echo_${org.id.slice(0, 8)}`;
    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: igPageId,
    });

    const payload = {
      object: 'instagram',
      entry: [{ id: igPageId, messaging: [{ sender: { id: 'page' }, message: { is_echo: true, text: 'echo' } }] }],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(META_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    // The webhook handler enqueues the job; the worker is responsible for dropping echoes
    expect(queueAddSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/email/inbound — Email ingestion
// ---------------------------------------------------------------------------
describe('POST /webhooks/email/inbound', () => {
  it('enqueues an email job when routing by org UUID in recipient address', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      To: `${org.id}@inbound.clerk.delivery`,
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
      senderEmail: 'alice@example.com',
      subject: 'Help please',
    });
  });

  it('enqueues an email job when routing by email integration address', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
    });

    const payload = {
      From: 'Bob <bob@example.com>',
      To: emailAddress,
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
      .send({ To: `${org.id}@inbound.clerk.delivery` });

    expect(res.status).toBe(400);
  });

  it('forwards Postmark Attachments through to the queued job', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      To: `${org.id}@inbound.clerk.delivery`,
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
        .send({ From: 'a@x.com', To: `${org.id}@inbound.clerk.delivery`, TextBody: 'hi' });

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
      expect(queueAddSpy).not.toHaveBeenCalled();
    });

    it('returns 401 when credentials are configured and the Authorization header is wrong', async () => {
      process.env.POSTMARK_INBOUND_USERNAME = 'postmark';
      process.env.POSTMARK_INBOUND_PASSWORD = 'secret';

      const res = await request(app)
        .post('/webhooks/email/inbound')
        .set('Authorization', `Basic ${Buffer.from('postmark:wrong').toString('base64')}`)
        .send({ From: 'a@x.com', To: `${org.id}@inbound.clerk.delivery`, TextBody: 'hi' });

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
          To: `${org.id}@inbound.clerk.delivery`,
          Subject: 'Hi',
          TextBody: 'hi',
        });

      expect(res.status).toBe(200);
      expect(queueAddSpy).toHaveBeenCalledOnce();
    });
  });

  it('omits attachments from the queued job when Postmark sends none', async () => {
    const payload = {
      From: 'Alice <alice@example.com>',
      To: `${org.id}@inbound.clerk.delivery`,
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
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(queueAddSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = queueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-shopify-order');
    expect(jobData).toMatchObject({ platform: 'shopify', organizationId: org.id, topic: 'orders/created' });
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
  });
});
