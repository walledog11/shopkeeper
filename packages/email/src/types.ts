export type EmailProvider = 'gmail' | 'postmark';

export type EmailOAuthProvider = 'gmail';

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

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailSender {
  send(email: OutboundEmail): Promise<EmailSendResult>;
}

export interface EmailIntegrationLike {
  id: string;
  emailProvider?: EmailProvider | null;
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

export class EmailProviderRequestTimeoutError extends Error {
  readonly operation: string;
  readonly provider: EmailProvider;
  readonly timeoutMs: number;

  constructor(
    provider: EmailProvider,
    operation: string,
    timeoutMs: number,
    cause: unknown,
  ) {
    super(`${provider} ${operation} timed out after ${timeoutMs}ms`, { cause });
    this.name = 'EmailProviderRequestTimeoutError';
    this.provider = provider;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}
