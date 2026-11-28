import { describe, expect, it } from 'vitest';
import { parseInboundEmailJobData, toInboundEmailJobPayload } from './inbound-email-job.js';

describe('toInboundEmailJobPayload', () => {
  it('marks the payload as an email job', () => {
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
    expect(payload.externalMessageId).toBe('<msg@id>');
    expect(payload.ingressTransport).toBe('postmark_forward');
  });
});

describe('parseInboundEmailJobData', () => {
  it('returns null for non-email platform', () => {
    expect(parseInboundEmailJobData({ platform: 'shopify', organizationId: 'x' })).toBeNull();
  });
});
