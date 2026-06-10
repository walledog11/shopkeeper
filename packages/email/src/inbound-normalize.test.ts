import { describe, expect, it } from 'vitest';
import { normalizeInboundEmail } from './inbound-normalize';
import type { ParsedEmail } from './types';

function parsed(overrides: Partial<ParsedEmail>): ParsedEmail {
  return {
    from: 'customer@example.test',
    fromName: 'Customer',
    to: ['support@merchant.test'],
    subject: 'Order question',
    text: 'where is my order?',
    html: null,
    messageId: '<abc@example.test>',
    inReplyTo: null,
    references: [],
    attachments: [],
    ...overrides,
  };
}

describe('normalizeInboundEmail', () => {
  it('maps parsed fields onto the inbound shape', () => {
    const result = normalizeInboundEmail(parsed({}));
    expect(result).toEqual({
      senderEmail: 'customer@example.test',
      senderName: 'Customer',
      subject: 'Order question',
      body: 'where is my order?',
      inboundMessageId: '<abc@example.test>',
      attachments: [],
    });
  });

  it('falls back to "No Subject" when subject is empty', () => {
    expect(normalizeInboundEmail(parsed({ subject: '   ' }))?.subject).toBe('No Subject');
  });

  it('returns null when sender or body is missing', () => {
    expect(normalizeInboundEmail(parsed({ from: null }))).toBeNull();
    expect(normalizeInboundEmail(parsed({ text: null }))).toBeNull();
  });
});
