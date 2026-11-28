import type { InboundEmailEvent, InboundEmailIngressTransport } from './inbound-event.js';

/** BullMQ payload for process-email jobs. */
export interface InboundEmailJobPayload extends InboundEmailEvent {
  platform: 'email';
}

export function toInboundEmailJobPayload(event: InboundEmailEvent): InboundEmailJobPayload {
  return { ...event, platform: 'email' };
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
  receivedAt?: string;
  traceId?: string;
  attachments?: InboundEmailEvent['attachments'];
  ingressTransport?: InboundEmailIngressTransport;
};

/** Maps a queued process-email job to InboundEmailEvent. */
export function parseInboundEmailJobData(data: InboundEmailJobLike): InboundEmailEvent | null {
  if (data.platform !== 'email') return null;
  if (!data.organizationId || !data.senderEmail || !data.body) return null;
  if (!data.traceId || !data.receivedAt || !data.ingressTransport) return null;

  return {
    organizationId: data.organizationId,
    integrationId: data.integrationId ?? '',
    senderEmail: data.senderEmail.trim().toLowerCase(),
    senderName: data.senderName ?? null,
    subject: data.subject?.trim() || 'No Subject',
    body: data.body,
    externalMessageId: data.externalMessageId ?? null,
    receivedAt: data.receivedAt,
    traceId: data.traceId,
    attachments: data.attachments,
    ingressTransport: data.ingressTransport,
  };
}
