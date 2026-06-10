import type { OutboundEmail } from './types.js';

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
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 8bit');
  lines.push('');
  lines.push(email.text);

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
