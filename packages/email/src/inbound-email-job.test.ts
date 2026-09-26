import { describe, expect, it } from 'vitest';
import { parseInboundEmailJobData, toInboundEmailJobPayload } from './inbound-email-job.js';

describe('toInboundEmailJobPayload', () => {
  it('mirrors externalMessageId to inboundMessageId', () => {
    const payload = toInboundEmailJobPayload({
      organizationId: 'org-1',
      integrationId: 'int-1',
      senderEmail: 'a@b.test',
      senderName: null,
      subject: 'Hi',
      body: 'Hello',
      externalMessageId: '<msg@id>',
      receivedAt: '2026-01-01T00:00:00.000Z',
      traceId: 'trace-1',
      ingressTransport: 'postmark_forward',
    });
    expect(payload.platform).toBe('email');
    expect(payload.inboundMessageId).toBe('<msg@id>');
    expect(payload.ingressTransport).toBe('postmark_forward');
  });
});

describe('parseInboundEmailJobData', () => {
  it('reads legacy inboundMessageId', () => {
    const event = parseInboundEmailJobData({
      platform: 'email',
      organizationId: 'org-1',
      integrationId: 'int-1',
      senderEmail: 'A@B.test',
      subject: 'Sub',
      body: 'Body',
      inboundMessageId: 'gmail:abc',
      receivedAt: '2026-01-01T00:00:00.000Z',
      traceId: 't1',
    });
    expect(event).toMatchObject({
      senderEmail: 'a@b.test',
      externalMessageId: 'gmail:abc',
      ingressTransport: 'gmail_sync',
    });
  });

  it('returns null for non-email platform', () => {
    expect(parseInboundEmailJobData({ platform: 'shopify', organizationId: 'x' })).toBeNull();
  });
});
