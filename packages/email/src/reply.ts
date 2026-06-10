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

export function buildThreadReplyHeaders(
  threadId: string,
  inReplyTo?: string | null,
  inboundDomain?: string,
): EmailHeader[] {
  const messageId = createThreadMessageId(threadId, inboundDomain);
  const referenceId = inReplyTo ?? messageId;

  return [
    { name: 'Message-ID', value: messageId },
    { name: 'In-Reply-To', value: referenceId },
    { name: 'References', value: referenceId },
  ];
}
