import { ServerClient } from 'postmark';
import {
  EmailNotConfiguredError,
  type EmailSender,
  type EmailSendResult,
  type OutboundEmail,
} from '../types.js';

export class PostmarkSender implements EmailSender {
  async send(email: OutboundEmail): Promise<EmailSendResult> {
    const apiKey = process.env.POSTMARK_API_KEY;
    if (!apiKey) throw new EmailNotConfiguredError();

    const client = new ServerClient(apiKey);
    const result = await client.sendEmail({
      From: `${email.fromName} <${email.fromAddress}>`,
      ...(email.replyTo && { ReplyTo: email.replyTo }),
      To: email.to,
      Subject: email.subject,
      TextBody: email.text,
      ...(email.headers && {
        Headers: email.headers.map((h) => ({ Name: h.name, Value: h.value })),
      }),
    });
    return { providerMessageId: result.MessageID };
  }
}
