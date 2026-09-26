export type InboundEmailIngressTransport = 'postmark_forward' | 'gmail_sync';

export type InboundEmailAttachment = {
  name: string;
  contentType: string;
  contentBase64: string;
};

/** Normalized ingress contract before BullMQ enqueue. */
export interface InboundEmailEvent {
  organizationId: string;
  integrationId: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  body: string;
  /** Persists to Message.externalMessageId */
  externalMessageId: string | null;
  receivedAt: string;
  traceId: string;
  attachments?: InboundEmailAttachment[];
  /** Provenance for logs/metrics only; not a second dedup namespace */
  ingressTransport: InboundEmailIngressTransport;
}
