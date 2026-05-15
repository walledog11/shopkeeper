export type EmailProvider = 'gmail' | 'outlook' | 'postmark';

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

export class EmailNotConfiguredError extends Error {
  constructor(message = 'Email not configured') {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}
