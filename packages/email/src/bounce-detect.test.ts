import { describe, expect, it } from 'vitest';
import { detectEmailBounce } from './bounce-detect.js';
import { createOutboundMessageId, parseOutboundMessageId } from './reply.js';
import type { ParsedEmail } from './types.js';

const OUTBOUND_ID = '3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6a7b';

function parsed(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: 'mailer-daemon@googlemail.com',
    fromName: 'Mail Delivery Subsystem',
    to: ['support@store.com'],
    subject: 'Delivery Status Notification (Failure)',
    text: 'Your message could not be delivered.\r\nDiagnostic-Code: smtp; 550 5.1.1 No such user\r\n',
    html: null,
    messageId: '<dsn-1@googlemail.com>',
    inReplyTo: createOutboundMessageId(OUTBOUND_ID, 'inbound.shopkeeper.app'),
    references: [],
    attachments: [],
    ...overrides,
  };
}

describe('parseOutboundMessageId', () => {
  it('recovers the Message.id it encoded', () => {
    expect(parseOutboundMessageId(createOutboundMessageId(OUTBOUND_ID))).toBe(OUTBOUND_ID);
  });

  it('rejects a thread Message-ID and other non-message ids', () => {
    expect(parseOutboundMessageId('<thread-3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6a7b@x.app>')).toBeNull();
    expect(parseOutboundMessageId('<message-not-a-uuid@x.app>')).toBeNull();
    expect(parseOutboundMessageId(null)).toBeNull();
    expect(parseOutboundMessageId('')).toBeNull();
  });
});

describe('detectEmailBounce', () => {
  it('detects a hard bounce and reads the diagnostic', () => {
    const result = detectEmailBounce(parsed());

    expect(result).toEqual({
      outboundMessageId: OUTBOUND_ID,
      detail: 'smtp; 550 5.1.1 No such user',
      permanent: true,
    });
  });

  it('reads a 4.x.x status as transient', () => {
    const result = detectEmailBounce(parsed({
      text: 'Delivery delayed.\r\nDiagnostic-Code: smtp; 452 4.2.2 Mailbox full\r\n',
    }));

    expect(result?.permanent).toBe(false);
  });

  // Absent an explicit transient status, a bounce the merchant hears about that
  // later succeeds is a smaller harm than one they never hear about.
  it('defaults to permanent when no status code is present', () => {
    const result = detectEmailBounce(parsed({ text: 'Delivery failed.' }));

    expect(result?.permanent).toBe(true);
    expect(result?.detail).toBeNull();
  });

  it('accepts postmaster as a daemon sender', () => {
    expect(detectEmailBounce(parsed({ from: 'postmaster@mail.example.com' }))).not.toBeNull();
  });

  it('finds the outbound id in References when In-Reply-To is absent', () => {
    const result = detectEmailBounce(parsed({
      inReplyTo: null,
      references: ['<thread-abc@x.app>', createOutboundMessageId(OUTBOUND_ID)],
    }));

    expect(result?.outboundMessageId).toBe(OUTBOUND_ID);
  });

  // The load-bearing negative. An ordinary customer reply also quotes our
  // Message-ID in References, so treating that alone as a bounce would silently
  // drop real customer mail.
  it('does not treat a customer reply quoting our Message-ID as a bounce', () => {
    const result = detectEmailBounce(parsed({
      from: 'jane@example.com',
      fromName: 'Jane',
      subject: 'Re: Your order',
      text: 'Thanks! One more question — 5.1.1 was my old order number.',
    }));

    expect(result).toBeNull();
  });

  it('ignores a daemon message that quotes no outbound id', () => {
    expect(detectEmailBounce(parsed({ inReplyTo: null, references: [] }))).toBeNull();
  });

  it('ignores a daemon message quoting only a thread id', () => {
    const result = detectEmailBounce(parsed({
      inReplyTo: '<thread-3f1a2b4c-5d6e-4f80-9a1b-2c3d4e5f6a7b@inbound.shopkeeper.app>',
      references: [],
    }));

    expect(result).toBeNull();
  });

  it('ignores a message with no sender', () => {
    expect(detectEmailBounce(parsed({ from: null }))).toBeNull();
  });
});
