import { simpleParser, type AddressObject } from 'mailparser';
import type { ParsedAttachment, ParsedEmail } from './types.js';

const NO_TEXT_FALLBACK = '[No plain text body]';

function firstAddress(value: AddressObject | AddressObject[] | undefined): { address: string | null; name: string | null } {
  const obj = Array.isArray(value) ? value[0] : value;
  const entry = obj?.value?.[0];
  return {
    address: entry?.address ?? null,
    name: entry?.name ? entry.name : null,
  };
}

function allAddresses(value: AddressObject | AddressObject[] | undefined): string[] {
  const objs = value ? (Array.isArray(value) ? value : [value]) : [];
  const out: string[] = [];
  for (const obj of objs) {
    for (const entry of obj.value) {
      if (entry.address) out.push(entry.address);
    }
  }
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function routingHeaders(
  headerLines: ReadonlyArray<{ key: string; line: string }>,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const { key, line } of headerLines) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey !== 'delivered-to' && normalizedKey !== 'x-original-to') continue;
    const separator = line.indexOf(':');
    const value = (separator >= 0 ? line.slice(separator + 1) : line).trim();
    if (!value) continue;
    const existing = headers[normalizedKey];
    headers[normalizedKey] = existing === undefined
      ? value
      : Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
  }
  return headers;
}

export async function parseMime(raw: Buffer | string): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw);

  const from = firstAddress(parsed.from);
  const text = parsed.text?.trim()
    || (parsed.html ? htmlToText(parsed.html) : '')
    || NO_TEXT_FALLBACK;

  const references = parsed.references
    ? Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references]
    : [];

  const attachments: ParsedAttachment[] = parsed.attachments.map((att) => ({
    name: att.filename ?? 'attachment',
    contentType: att.contentType ?? 'application/octet-stream',
    contentBase64: att.content.toString('base64'),
  }));

  return {
    from: from.address,
    fromName: from.name,
    to: allAddresses(parsed.to),
    routingHeaders: routingHeaders(parsed.headerLines),
    subject: parsed.subject ?? null,
    text,
    html: typeof parsed.html === 'string' ? parsed.html : null,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references,
    attachments,
  };
}
