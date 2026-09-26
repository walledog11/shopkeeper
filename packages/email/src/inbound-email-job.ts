import type { InboundEmailEvent, InboundEmailIngressTransport } from './inbound-event.js';

/** BullMQ payload for process-email jobs (includes legacy fields for in-flight jobs). */
export interface InboundEmailJobPayload extends InboundEmailEvent {
  platform: 'email';
  /** Legacy alias of externalMessageId — kept until in-flight jobs drain. */
  inboundMessageId: string | null;
}

export function toInboundEmailJobPayload(event: InboundEmailEvent): InboundEmailJobPayload {
  return {
    ...event,
    platform: 'email',
    inboundMessageId: event.externalMessageId,
  };
}

type InboundEmailJobLike = {
  platform?: string;
  organizationId?: string;
  integrationId?: string;
  senderEmail?: string;
  senderName?: string | null;
  subject?: string;
  body?: string;
  externalMessageId?: string | null;
  inboundMessageId?: string | null;
  receivedAt?: string;
  traceId?: string;
  attachments?: InboundEmailEvent['attachments'];
  ingressTransport?: InboundEmailIngressTransport;
};

function inferLegacyIngressTransport(data: InboundEmailJobLike): InboundEmailIngressTransport {
  const id = data.externalMessageId ?? data.inboundMessageId;
  if (typeof id === 'string' && id.startsWith('gmail:')) return 'gmail_sync';
  return 'postmark_forward';
}

/** Maps a queued process-email job (new or legacy shape) to InboundEmailEvent. */
export function parseInboundEmailJobData(data: InboundEmailJobLike): InboundEmailEvent | null {
  if (data.platform !== 'email') return null;
  if (!data.organizationId || !data.senderEmail || !data.body) return null;
  if (!data.traceId || !data.receivedAt) return null;

  return {
    organizationId: data.organizationId,
    integrationId: data.integrationId ?? '',
    senderEmail: data.senderEmail.trim().toLowerCase(),
    senderName: data.senderName ?? null,
    subject: data.subject?.trim() || 'No Subject',
    body: data.body,
    externalMessageId: data.externalMessageId ?? data.inboundMessageId ?? null,
    receivedAt: data.receivedAt,
    traceId: data.traceId,
    attachments: data.attachments,
    ingressTransport: data.ingressTransport ?? inferLegacyIngressTransport(data),
  };
}
