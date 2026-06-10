import type { NormalizedInboundEmail, ParsedEmail } from './types.js';

const NO_SUBJECT_FALLBACK = 'No Subject';

/**
 * Map a parsed MIME message onto the inbound email shape the worker pipeline
 * already consumes (mirrors the Postmark webhook normalization). Quoted-reply
 * stripping stays at the worker boundary; this only reshapes fields.
 */
export function normalizeInboundEmail(parsed: ParsedEmail): NormalizedInboundEmail | null {
  if (!parsed.from || !parsed.text) return null;

  return {
    senderEmail: parsed.from,
    senderName: parsed.fromName,
    subject: parsed.subject?.trim() || NO_SUBJECT_FALLBACK,
    body: parsed.text,
    inboundMessageId: parsed.messageId,
    attachments: parsed.attachments,
  };
}
