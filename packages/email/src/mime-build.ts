import { randomUUID } from 'node:crypto';
import type { OutboundAttachment, OutboundEmail } from './types.js';

// RFC 2045 caps an encoded line at 76 characters.
const BASE64_LINE_LENGTH = 76;

function boundary(): string {
  return `----=_shopkeeper_${randomUUID().replace(/-/g, '')}`;
}

function wrapBase64(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  const lines: string[] = [];
  for (let i = 0; i < normalized.length; i += BASE64_LINE_LENGTH) {
    lines.push(normalized.slice(i, i + BASE64_LINE_LENGTH));
  }
  return lines.join('\r\n');
}

function textPart(email: OutboundEmail): string[] {
  return [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    email.text,
  ];
}

function htmlPart(html: string): string[] {
  return [
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
  ];
}

function attachmentPart(attachment: OutboundAttachment): string[] {
  return [
    `Content-Type: ${attachment.contentType}; name="${sanitizeFilename(attachment.name)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${sanitizeFilename(attachment.name)}"`,
    '',
    wrapBase64(attachment.contentBase64),
  ];
}

// A quote or CR/LF in a filename would terminate the parameter early and let the
// rest of the name be read as header syntax.
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, '_');
}

function multipart(type: 'alternative' | 'mixed', parts: string[][]): string[] {
  const mark = boundary();
  const lines: string[] = [`Content-Type: multipart/${type}; boundary="${mark}"`, ''];
  for (const part of parts) {
    lines.push(`--${mark}`);
    lines.push(...part);
  }
  lines.push(`--${mark}--`);
  return lines;
}

// text/plain stays a flat single-part message so the common reply is byte-for-byte
// what it was before HTML and attachments existed.
function bodyLines(email: OutboundEmail): string[] {
  const attachments = email.attachments ?? [];
  const body = email.html
    ? multipart('alternative', [textPart(email), htmlPart(email.html)])
    : textPart(email);

  if (attachments.length === 0) return body;
  return multipart('mixed', [body, ...attachments.map(attachmentPart)]);
}

function buildMimeBytes(email: OutboundEmail): Buffer {
  const lines: string[] = [];
  lines.push(`From: ${formatAddress(email.fromName, email.fromAddress)}`);
  lines.push(`To: ${email.to}`);
  if (email.replyTo && email.replyTo !== email.fromAddress) {
    lines.push(`Reply-To: ${email.replyTo}`);
  }
  lines.push(`Subject: ${encodeHeader(email.subject)}`);
  for (const h of email.headers ?? []) lines.push(`${h.name}: ${h.value}`);
  lines.push('MIME-Version: 1.0');
  lines.push(...bodyLines(email));

  return Buffer.from(lines.join('\r\n'), 'utf8');
}

export function buildRawMime(email: OutboundEmail): string {
  return buildMimeBytes(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function buildMimeBase64(email: OutboundEmail): string {
  return buildMimeBytes(email).toString('base64');
}

function formatAddress(name: string, address: string): string {
  if (!name) return address;
  if (isAscii(name) && !/["\\<>]/.test(name)) return `${name} <${address}>`;
  if (!isAscii(name)) return `${encodeHeader(name)} <${address}>`;
  return `"${name.replace(/["\\]/g, '\\$&')}" <${address}>`;
}

function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}
