import { ServerClient } from 'postmark';
import { EmailNotConfiguredError, type EmailSender, type OutboundEmail } from './types';

export class PostmarkSender implements EmailSender {
  async send(email: OutboundEmail): Promise<void> {
    const apiKey = process.env.POSTMARK_API_KEY;
    if (!apiKey) throw new EmailNotConfiguredError();

    const client = new ServerClient(apiKey);
    await client.sendEmail({
      From: `${email.fromName} <${email.fromAddress}>`,
      ...(email.replyTo && { ReplyTo: email.replyTo }),
      To: email.to,
      Subject: email.subject,
      TextBody: email.text,
      ...(email.headers && {
        Headers: email.headers.map((h) => ({ Name: h.name, Value: h.value })),
      }),
    });
  }
}
