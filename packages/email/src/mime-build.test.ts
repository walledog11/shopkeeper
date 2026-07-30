import { describe, expect, it } from 'vitest';
import { buildMimeBase64 } from './mime-build.js';
import { parseMime } from './mime-parse.js';
import type { OutboundEmail } from './types.js';

const base: OutboundEmail = {
  to: 'jane@example.com',
  fromAddress: 'support@store.com',
  fromName: 'Wool Co',
  subject: 'Your order',
  text: 'Your order shipped.',
};

function decode(email: OutboundEmail): string {
  return Buffer.from(buildMimeBase64(email), 'base64').toString('utf8');
}

// Round-tripping through the package's own inbound parser proves the bytes are
// really parseable MIME rather than a string that merely looks right.
function reparse(email: OutboundEmail) {
  return parseMime(Buffer.from(buildMimeBase64(email), 'base64'));
}

describe('buildMimeBase64', () => {
  // The overwhelmingly common reply must not become multipart just because the
  // builder now can be.
  it('keeps a text-only email a flat single-part message', () => {
    const raw = decode(base);

    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).not.toContain('multipart');
    expect(raw.endsWith('Your order shipped.')).toBe(true);
  });

  it('builds multipart/alternative when html is supplied', async () => {
    const email = { ...base, html: '<p>Your order shipped.</p>' };
    const raw = decode(email);

    expect(raw).toContain('Content-Type: multipart/alternative; boundary="');
    // Plain text must come first: a client picks the last part it understands,
    // so reversing these would hide the HTML from clients that support it.
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'));

    const parsed = await reparse(email);
    expect(parsed.text?.trim()).toBe('Your order shipped.');
    expect(parsed.html).toContain('<p>Your order shipped.</p>');
  });

  it('wraps a text-only body in multipart/mixed when attachments are present', async () => {
    const email: OutboundEmail = {
      ...base,
      attachments: [{
        name: 'label.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('pdf-bytes').toString('base64'),
      }],
    };
    const raw = decode(email);

    expect(raw).toContain('Content-Type: multipart/mixed; boundary="');
    expect(raw).toContain('Content-Disposition: attachment; filename="label.pdf"');

    const parsed = await reparse(email);
    expect(parsed.text?.trim()).toBe('Your order shipped.');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].name).toBe('label.pdf');
    expect(Buffer.from(parsed.attachments[0].contentBase64, 'base64').toString('utf8')).toBe('pdf-bytes');
  });

  it('nests alternative inside mixed when html and attachments are both present', async () => {
    const email: OutboundEmail = {
      ...base,
      html: '<p>Your order shipped.</p>',
      attachments: [{
        name: 'label.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('pdf-bytes').toString('base64'),
      }],
    };
    const raw = decode(email);

    expect(raw.indexOf('multipart/mixed')).toBeLessThan(raw.indexOf('multipart/alternative'));

    const parsed = await reparse(email);
    expect(parsed.text?.trim()).toBe('Your order shipped.');
    expect(parsed.html).toContain('<p>Your order shipped.</p>');
    expect(parsed.attachments).toHaveLength(1);
  });

  it('round-trips multiple attachments', async () => {
    const email: OutboundEmail = {
      ...base,
      attachments: [
        { name: 'a.txt', contentType: 'text/plain', contentBase64: Buffer.from('alpha').toString('base64') },
        { name: 'b.txt', contentType: 'text/plain', contentBase64: Buffer.from('beta').toString('base64') },
      ],
    };

    const parsed = await reparse(email);
    expect(parsed.attachments.map((a) => a.name)).toEqual(['a.txt', 'b.txt']);
  });

  // A quote or newline in a filename would terminate the parameter early and let
  // the remainder be read as header syntax.
  it('sanitizes a filename that would break out of the header', async () => {
    const email: OutboundEmail = {
      ...base,
      attachments: [{
        name: 'evil".pdf\r\nX-Injected: yes',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('x').toString('base64'),
      }],
    };
    const raw = decode(email);

    // The text survives inside the quoted filename; what must not survive is its
    // ability to start a line, which is what would make it a header.
    expect(raw.split('\r\n').some((line) => line.startsWith('X-Injected:'))).toBe(false);

    const parsed = await reparse(email);
    expect(parsed.attachments).toHaveLength(1);
  });

  it('wraps long base64 payloads to RFC-legal line lengths', () => {
    const email: OutboundEmail = {
      ...base,
      attachments: [{
        name: 'big.bin',
        contentType: 'application/octet-stream',
        contentBase64: Buffer.alloc(1024, 0x41).toString('base64'),
      }],
    };
    const raw = decode(email);

    const longest = Math.max(...raw.split('\r\n').map((line) => line.length));
    expect(longest).toBeLessThanOrEqual(998);
  });

  it('still carries reply headers and an encoded non-ASCII subject', async () => {
    const email: OutboundEmail = {
      ...base,
      subject: 'Ihre Bestellung ist unterwegs — für Sie',
      html: '<p>hi</p>',
      headers: [{ name: 'In-Reply-To', value: '<abc@mail.example.com>' }],
    };
    const raw = decode(email);

    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).toContain('In-Reply-To: <abc@mail.example.com>');

    const parsed = await reparse(email);
    expect(parsed.subject).toBe('Ihre Bestellung ist unterwegs — für Sie');
    expect(parsed.inReplyTo).toBe('<abc@mail.example.com>');
  });
});
