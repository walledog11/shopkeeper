export type EmailProvider = 'gmail' | 'outlook' | 'postmark';

export type EmailOAuthProvider = 'gmail' | 'outlook';

export interface EmailHeader {
  name: string;
  value: string;
}

export interface OutboundEmail {
  to: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  text: string;
  headers?: EmailHeader[];
}

export interface EmailSender {
  send(email: OutboundEmail): Promise<void>;
}

export interface EmailIntegrationLike {
  id: string;
  metadata: unknown;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface ParsedAttachment {
  name: string;
  contentType: string;
  contentBase64: string;
}

export interface ParsedEmail {
  from: string | null;
  fromName: string | null;
  to: string[];
  routingHeaders?: Record<string, string | string[]>;
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: ParsedAttachment[];
}

export interface NormalizedInboundEmail {
  senderEmail: string;
  senderName: string | null;
  subject: string;
  body: string;
  inboundMessageId: string | null;
  attachments: ParsedAttachment[];
}

export class EmailNotConfiguredError extends Error {
  constructor(message = 'Email not configured') {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}
