import type { EmailHeader } from './types.js';

const DEFAULT_INBOUND_EMAIL_DOMAIN = 'inbound.shopkeeper.app';
const DEFAULT_REPLY_SUBJECT = 'Your inquiry';

export function formatReplySubject(
  subject: string | null | undefined,
  fallback = DEFAULT_REPLY_SUBJECT,
): string {
  const raw = subject?.trim() || fallback;
  return /^re:\s/i.test(raw) ? raw : `Re: ${raw}`;
}

export function createThreadMessageId(
  threadId: string,
  inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || DEFAULT_INBOUND_EMAIL_DOMAIN,
): string {
  return `<thread-${threadId}@${inboundDomain}>`;
}

export function createOutboundMessageId(
  messageId: string,
  inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || DEFAULT_INBOUND_EMAIL_DOMAIN,
): string {
  return `<message-${messageId}@${inboundDomain}>`;
}

function buildReplyHeaders(
  messageId: string,
  threadId: string,
  inReplyTo?: string | null,
  inboundDomain?: string,
): EmailHeader[] {
  const threadMessageId = createThreadMessageId(threadId, inboundDomain);
  // Provider fallback keys (for example `gmail:abc123`) are database
  // idempotency values, not RFC Message-IDs, and must never leak into reply
  // threading headers.
  const referenceId = /^<[^<>\s]+@[^<>\s]+>$/.test(inReplyTo?.trim() ?? '')
    ? inReplyTo!.trim()
    : threadMessageId;

  return [
    { name: 'Message-ID', value: messageId },
    { name: 'In-Reply-To', value: referenceId },
    { name: 'References', value: referenceId },
  ];
}

export function buildThreadReplyHeaders(
  threadId: string,
  inReplyTo?: string | null,
  inboundDomain?: string,
): EmailHeader[] {
  const threadMessageId = createThreadMessageId(threadId, inboundDomain);
  return buildReplyHeaders(threadMessageId, threadId, inReplyTo, inboundDomain);
}

export function buildOutboundMessageReplyHeaders(
  threadId: string,
  messageId: string,
  inReplyTo?: string | null,
  inboundDomain?: string,
): EmailHeader[] {
  return buildReplyHeaders(
    createOutboundMessageId(messageId, inboundDomain),
    threadId,
    inReplyTo,
    inboundDomain,
  );
}
