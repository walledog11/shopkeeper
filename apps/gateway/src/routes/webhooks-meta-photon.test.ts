import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ChannelType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';
import { hmacSha256 } from '../test-fixtures/webhook-route-test-helpers.js';
import {
  INSTAGRAM_SECRET,
  INSTAGRAM_VERIFY_TOKEN,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const {
  SpectrumConfigError,
  app,
  getPlatformSpectrumAppSpy,
  mockLogger,
  queueAddBulkSpy,
  queueAddSpy,
  spectrumWebhookSpy,
  uploadInboundAttachmentSpy,
} = webhookFixture;
let org: { id: string };

beforeEach(() => {
  org = webhookFixture.org;
});

describe('GET /webhooks/meta', () => {
  it('returns 200 and echoes the challenge when token matches', async () => {
    const res = await request(app)
      .get('/webhooks/meta')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': INSTAGRAM_VERIFY_TOKEN,
        'hub.challenge': 'abc123',
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('returns 403 when token does not match', async () => {
    const res = await request(app)
      .get('/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Webhook] Instagram handshake failed: token mismatch',
    );
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
  const sentAt = Date.parse('2026-07-14T12:00:00.000Z');

  async function createInstagramLoginIntegration(organizationId: string, accountId: string) {
    return createTestIntegration(organizationId, {
      platform: ChannelType.ig_dm,
      externalAccountId: accountId,
      accessToken: 'instagram-long-lived-token',
      metadata: { instagram: { authModel: 'instagram_login' } },
    });
  }

  it('enqueues one normalized job when HMAC is valid and an active integration exists', async () => {
    const instagramAccountId = `ig_account_${org.id.slice(0, 8)}`;
    const integration = await createInstagramLoginIntegration(org.id, instagramAccountId);

    const payload = {
      object: 'instagram',
      entry: [
        {
          id: instagramAccountId,
          messaging: [
            {
              sender: { id: 'sender_123' },
              timestamp: sentAt,
              message: { text: 'Hello!', mid: 'mid.test001' },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(INSTAGRAM_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('EVENT_RECEIVED');
    expect(queueAddBulkSpy).toHaveBeenCalledOnce();
    expect(queueAddBulkSpy.mock.calls[0][0]).toEqual([
      {
        name: 'process-ig-dm',
        data: {
          platform: 'ig_dm',
          integrationId: integration.id,
          organizationId: org.id,
          instagramAccountId,
          senderIgsid: 'sender_123',
          externalMessageId: 'mid.test001',
          providerSentAt: '2026-07-14T12:00:00.000Z',
          text: 'Hello!',
          attachments: [],
          traceId: expect.any(String),
        },
      },
    ]);
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when HMAC signature is invalid', async () => {
    const payload = { object: 'instagram', entry: [{ id: 'page123', messaging: [{ message: {} }] }] };
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=badsig')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(401);
    expect(queueAddBulkSpy).not.toHaveBeenCalled();
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Signature mismatch — rejecting request.');
  });

  it('returns 401 when the HMAC signature is missing', async () => {
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ object: 'instagram', entry: [] }));

    expect(res.status).toBe(401);
    expect(queueAddBulkSpy).not.toHaveBeenCalled();
  });

  it('isolates multiple entries across organizations and enqueues every message', async () => {
    const otherOrg = await createTestOrg();
    try {
      const firstAccountId = `ig_first_${org.id.slice(0, 8)}`;
      const secondAccountId = `ig_second_${otherOrg.id.slice(0, 8)}`;
      const firstIntegration = await createInstagramLoginIntegration(org.id, firstAccountId);
      const secondIntegration = await createInstagramLoginIntegration(otherOrg.id, secondAccountId);
      const payload = {
        object: 'instagram',
        entry: [
          {
            id: firstAccountId,
            messaging: [
              {
                sender: { id: 'first_sender' },
                timestamp: sentAt,
                message: { text: 'First', mid: 'mid.first' },
              },
              {
                sender: { id: 'first_sender' },
                timestamp: sentAt + 1_000,
                message: { text: 'Second', mid: 'mid.second' },
              },
            ],
          },
          {
            id: secondAccountId,
            messaging: [
              {
                sender: { id: 'second_sender' },
                timestamp: sentAt + 2_000,
                message: { text: 'Other tenant', mid: 'mid.other' },
              },
            ],
          },
        ],
      };
      const body = JSON.stringify(payload);

      const res = await request(app)
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', hmacSha256(INSTAGRAM_SECRET, body))
        .send(body);

      expect(res.status).toBe(200);
      const jobs = queueAddBulkSpy.mock.calls[0][0];
      expect(jobs).toHaveLength(3);
      expect(jobs.map((job: { data: { integrationId: string; organizationId: string } }) => ({
        integrationId: job.data.integrationId,
        organizationId: job.data.organizationId,
      }))).toEqual([
        { integrationId: firstIntegration.id, organizationId: org.id },
        { integrationId: firstIntegration.id, organizationId: org.id },
        { integrationId: secondIntegration.id, organizationId: otherOrg.id },
      ]);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('drops unknown accounts without affecting valid entries in the same delivery', async () => {
    const instagramAccountId = `ig_known_${org.id.slice(0, 8)}`;
    const integration = await createInstagramLoginIntegration(org.id, instagramAccountId);
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'unknown_page_id',
          messaging: [
            { sender: { id: 'abc' }, timestamp: sentAt, message: { text: 'unknown' } },
          ],
        },
        {
          id: instagramAccountId,
          messaging: [
            { sender: { id: 'known' }, timestamp: sentAt, message: { text: 'known' } },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(INSTAGRAM_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddBulkSpy).toHaveBeenCalledOnce();
    expect(queueAddBulkSpy.mock.calls[0][0]).toHaveLength(1);
    expect(queueAddBulkSpy.mock.calls[0][0][0].data).toMatchObject({
      integrationId: integration.id,
      senderIgsid: 'known',
    });
  });

  it('skips echo, self, and malformed events while preserving unsupported content', async () => {
    const instagramAccountId = `ig_echo_${org.id.slice(0, 8)}`;
    await createInstagramLoginIntegration(org.id, instagramAccountId);

    const payload = {
      object: 'instagram',
      entry: [{
        id: instagramAccountId,
        messaging: [
          {
            sender: { id: 'page' },
            timestamp: sentAt,
            message: { is_echo: true, text: 'echo' },
          },
          {
            sender: { id: 'page' },
            timestamp: sentAt,
            message: { is_self: true, text: 'self' },
          },
          { sender: { id: 'missing_timestamp' }, message: { text: 'malformed' } },
          { sender: { id: 'customer' }, timestamp: sentAt, message: { mid: 'unsupported' } },
        ],
      }],
    };
    const body = JSON.stringify(payload);
    const sig = hmacSha256(INSTAGRAM_SECRET, body);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(queueAddBulkSpy).toHaveBeenCalledOnce();
    expect(queueAddBulkSpy.mock.calls[0][0]).toHaveLength(1);
    expect(queueAddBulkSpy.mock.calls[0][0][0].data).toMatchObject({
      senderIgsid: 'customer',
      text: null,
      attachments: [{ type: 'unsupported', url: null }],
    });
  });

  it('returns 500 when normalized events cannot be durably enqueued', async () => {
    const instagramAccountId = `ig_queue_failure_${org.id.slice(0, 8)}`;
    await createInstagramLoginIntegration(org.id, instagramAccountId);
    queueAddBulkSpy.mockRejectedValueOnce(new Error('Redis unavailable'));
    const payload = {
      object: 'instagram',
      entry: [{
        id: instagramAccountId,
        messaging: [{
          sender: { id: 'customer' },
          timestamp: sentAt,
          message: { text: 'retry me', mid: 'mid.retry' },
        }],
      }],
    };
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', hmacSha256(INSTAGRAM_SECRET, body))
      .send(body);

    expect(res.status).toBe(500);
  });

  it('rejects signed legacy page deliveries', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', hmacSha256(INSTAGRAM_SECRET, body))
      .send(body);

    expect(res.status).toBe(404);
    expect(queueAddBulkSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/photon — iMessage ingestion through the platform Spectrum line
// ---------------------------------------------------------------------------
describe('POST /webhooks/photon', () => {
  it('passes the raw request to the platform Spectrum app and dispatches to the operator agent', async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    spectrumWebhookSpy.mockImplementationOnce(async (requestInput, handler) => {
      await handler(
        { id: 'any;-;+15551234567', __platform: 'iMessage', send: sendSpy },
        {
          id: 'imsg_text_001',
          direction: 'inbound',
          platform: 'iMessage',
          sender: { id: '+15551234567', __platform: 'iMessage' },
          space: { id: 'any;-;+15551234567', __platform: 'iMessage' },
          timestamp: new Date('2026-06-17T12:00:00.000Z'),
          content: { type: 'text', text: 'Hello from iMessage' },
        },
      );
      return { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from('OK') };
    });

    const body = JSON.stringify({ event: 'message' });
    const res = await request(app)
      .post('/webhooks/photon')
      .set('Content-Type', 'application/json')
      .set('x-spectrum-signature', 'v0=test')
      .set('x-spectrum-timestamp', '1781716800')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(getPlatformSpectrumAppSpy).toHaveBeenCalledOnce();
    expect(spectrumWebhookSpy).toHaveBeenCalledOnce();
    const [webhookRequest] = spectrumWebhookSpy.mock.calls[0];
    expect(Buffer.isBuffer(webhookRequest.body)).toBe(true);
    expect(Buffer.from(webhookRequest.body).toString('utf8')).toBe(body);
    expect(webhookRequest.headers['x-spectrum-signature']).toBe('v0=test');

    // iMessage is an operator channel: no customer ticket is enqueued. The
    // sender is unbound, so the operator handler replies with connect
    // instructions over the same Spectrum space.
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(sendSpy.mock.calls[0][0]).toContain('Integrations → iMessage');
  });

  it('flattens non-text content to a label and dispatches without uploading an attachment', async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    spectrumWebhookSpy.mockImplementationOnce(async (_requestInput, handler) => {
      await handler(
        { id: 'any;-;+15557654321', __platform: 'iMessage', send: sendSpy },
        {
          id: 'imsg_attachment_001',
          direction: 'inbound',
          platform: 'iMessage',
          sender: { id: '+15557654321', __platform: 'iMessage' },
          space: { id: 'any;-;+15557654321', __platform: 'iMessage' },
          timestamp: new Date('2026-06-17T12:00:00.000Z'),
          content: {
            type: 'attachment',
            id: 'attachment_001',
            name: 'receipt.png',
            mimeType: 'image/png',
            read: vi.fn(),
            stream: vi.fn(),
          },
        },
      );
      return { status: 200, headers: {}, body: Buffer.from('OK') };
    });

    const res = await request(app)
      .post('/webhooks/photon')
      .set('Content-Type', 'application/json')
      .set('x-spectrum-signature', 'v0=test')
      .send(JSON.stringify({ event: 'message' }));

    expect(res.status).toBe(200);
    // Operator channel: attachment bytes are never persisted to org blob storage.
    expect(uploadInboundAttachmentSpy).not.toHaveBeenCalled();
    expect(queueAddSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledOnce();
  });

  it('returns 503 when iMessage is not configured on the deployment', async () => {
    getPlatformSpectrumAppSpy.mockRejectedValueOnce(new SpectrumConfigError('not configured'));

    const res = await request(app)
      .post('/webhooks/photon')
      .set('Content-Type', 'application/json')
      .set('x-spectrum-signature', 'v0=test')
      .send(JSON.stringify({ event: 'message' }));

    expect(res.status).toBe(503);
    expect(spectrumWebhookSpy).not.toHaveBeenCalled();
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when the global JSON parser did not capture a raw body', async () => {
    const res = await request(app)
      .post('/webhooks/photon')
      .set('Content-Type', 'text/plain')
      .send('not-json');

    expect(res.status).toBe(401);
    expect(getPlatformSpectrumAppSpy).not.toHaveBeenCalled();
    expect(spectrumWebhookSpy).not.toHaveBeenCalled();
    expect(queueAddSpy).not.toHaveBeenCalled();
  });

  it('skips duplicate webhook deliveries for the same provider message id', async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const messageId = 'imsg_dedupe_001';
    let dispatchCount = 0;

    spectrumWebhookSpy.mockImplementation(async (_requestInput, handler) => {
      dispatchCount += 1;
      await handler(
        { id: 'any;-;+15551234567', __platform: 'iMessage', send: sendSpy },
        {
          id: messageId,
          direction: 'inbound',
          platform: 'iMessage',
          sender: { id: '+15551234567', __platform: 'iMessage' },
          space: { id: 'any;-;+15551234567', __platform: 'iMessage' },
          timestamp: new Date('2026-06-17T12:00:00.000Z'),
          content: { type: 'text', text: 'Hello from iMessage' },
        },
      );
      return { status: 200, headers: {}, body: Buffer.from('OK') };
    });

    const body = JSON.stringify({ event: 'message' });
    const post = () => request(app)
      .post('/webhooks/photon')
      .set('Content-Type', 'application/json')
      .set('x-spectrum-signature', 'v0=test')
      .send(body);

    const first = await post();
    const second = await post();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(dispatchCount).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ messageId, senderId: '+15551234567' }),
      '[Webhook] iMessage duplicate delivery skipped',
    );
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/email/inbound — Email ingestion
// ---------------------------------------------------------------------------
