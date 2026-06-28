import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ChannelType } from '@shopkeeper/db';
import { createTestIntegration } from '@shopkeeper/db/test-helpers';
import { hmacSha256 } from '../test-fixtures/webhook-route-test-helpers.js';
import {
  META_SECRET,
  VERIFY_TOKEN,
  webhookFixture,
} from '../test-fixtures/webhook-routes-test-fixture.js';

const {
  SpectrumConfigError,
  app,
  getPlatformSpectrumAppSpy,
  mockLogger,
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
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'abc123' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('returns 403 when token does not match', async () => {
    const res = await request(app)
      .get('/webhooks/meta')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Meta handshake failed: token mismatch');
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
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Signature mismatch — rejecting request.');
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
});

// ---------------------------------------------------------------------------
// POST /webhooks/email/inbound — Email ingestion
// ---------------------------------------------------------------------------
