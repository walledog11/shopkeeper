import { describe, expect, it } from 'vitest';
import { parseMime } from './mime-parse';

const CRLF = '\r\n';

function mime(lines: string[]): string {
  return lines.join(CRLF);
}

describe('parseMime', () => {
  it('parses a plain-text message with headers and Message-ID', async () => {
    const raw = mime([
      'From: Jane Customer <jane@example.test>',
      'To: support@merchant.test',
      'Subject: Where is my order?',
      'Message-ID: <abc123@example.test>',
      'In-Reply-To: <prev@merchant.test>',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'Hi, any update on order 1234?',
    ]);

    const parsed = await parseMime(raw);

    expect(parsed.from).toBe('jane@example.test');
    expect(parsed.fromName).toBe('Jane Customer');
    expect(parsed.to).toEqual(['support@merchant.test']);
    expect(parsed.subject).toBe('Where is my order?');
    expect(parsed.messageId).toBe('<abc123@example.test>');
    expect(parsed.inReplyTo).toBe('<prev@merchant.test>');
    expect(parsed.text).toContain('order 1234');
    expect(parsed.attachments).toHaveLength(0);
  });

  it('prefers the plain-text part of a multipart/alternative message', async () => {
    const boundary = 'b0undary';
    const raw = mime([
      'From: jane@example.test',
      'To: support@merchant.test',
      'Subject: Multipart',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'plain body wins',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      '<p>html body</p>',
      `--${boundary}--`,
    ]);

    const parsed = await parseMime(raw);

    expect(parsed.text).toBe('plain body wins');
    expect(parsed.html).toContain('html body');
  });

  it('falls back to stripped HTML when there is no plain-text body', async () => {
    const raw = mime([
      'From: jane@example.test',
      'To: support@merchant.test',
      'Subject: HTML only',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      '<div>Hello<br>there</div>',
    ]);

    const parsed = await parseMime(raw);

    expect(parsed.html).toContain('Hello');
    expect(parsed.text).toContain('Hello');
    expect(parsed.text).toContain('there');
    expect(parsed.text).not.toContain('<');
  });

  it('extracts attachments as base64', async () => {
    const boundary = 'mixed1';
    const fileContent = 'hello attachment';
    const fileB64 = Buffer.from(fileContent, 'utf8').toString('base64');
    const raw = mime([
      'From: jane@example.test',
      'To: support@merchant.test',
      'Subject: With attachment',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'see attached',
      `--${boundary}`,
      'Content-Type: text/plain; name="note.txt"',
      'Content-Disposition: attachment; filename="note.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      fileB64,
      `--${boundary}--`,
    ]);

    const parsed = await parseMime(raw);

    expect(parsed.text).toBe('see attached');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].name).toBe('note.txt');
    expect(Buffer.from(parsed.attachments[0].contentBase64, 'base64').toString('utf8')).toBe(fileContent);
  });

  it('retains alias routing headers for support-address filtering', async () => {
    const raw = mime([
      'From: jane@example.test',
      'To: mailbox-owner@merchant.test',
      'Delivered-To: support@merchant.test',
      'X-Original-To: first@merchant.test',
      'X-Original-To: support@merchant.test',
      '',
      'alias delivery',
    ]);

    const parsed = await parseMime(raw);

    expect(parsed.routingHeaders).toEqual({
      'delivered-to': 'support@merchant.test',
      'x-original-to': ['first@merchant.test', 'support@merchant.test'],
    });
  });
});
