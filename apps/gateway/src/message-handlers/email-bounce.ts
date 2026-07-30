import { db, SenderType } from '@shopkeeper/db';
import logger from '../logger.js';

export type EmailBounceProvider = 'postmark' | 'gmail';

// How the bounce is attributed back to the row we sent. The recipient address
// alone would match every reply on the thread, including ones that delivered
// fine, so it is never a locator.
export type EmailBounceLocator =
  // The provider's own id for the send, as reported on its bounce webhook.
  | { kind: 'provider_message_id'; value: string }
  // Our Message.id, recovered from the RFC Message-ID a DSN quotes back. Used
  // where the provider has no bounce webhook and the bounce arrives as mail.
  | { kind: 'outbound_message_id'; value: string };

export interface EmailBounceEvent {
  provider: EmailBounceProvider;
  locator: EmailBounceLocator;
  recipient: string | null;
  bounceType: string | null;
  detail: string | null;
  // Whether the address is permanently undeliverable. A soft bounce may still
  // arrive later, so the note wording differs.
  permanent: boolean;
}

export type EmailBounceOutcome = 'recorded' | 'already_recorded' | 'unmatched';

function noteText(event: EmailBounceEvent): string {
  const who = event.recipient ? ` to ${event.recipient}` : '';
  const kind = event.permanent ? 'permanently rejected' : 'could not be delivered yet';
  const why = event.detail ? ` Reason: ${event.detail}` : '';
  const advice = event.permanent
    ? ' The customer did not receive it. Check the address or reach them another way before assuming this ticket is answered.'
    : ' The provider may still retry. If it bounces again the customer never received it.';
  return `Email delivery failed: the reply${who} was ${kind}.${why}${advice}`;
}

// Records a provider bounce against the outbound message it belongs to.
//
// A bounced reply is a silent failure in the worst place: the thread reads as
// answered and the customer heard nothing. So this both moves the message out of
// `sent` and leaves a visible note on the thread rather than only logging.
export async function recordEmailBounce(event: EmailBounceEvent): Promise<EmailBounceOutcome> {
  const message = await db.message.findFirst({
    where: {
      ...(event.locator.kind === 'provider_message_id'
        ? { providerMessageId: event.locator.value }
        : { id: event.locator.value }),
      deletedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      threadId: true,
      sendStatus: true,
    },
  });

  if (!message) {
    // Not an error: bounces arrive for sends this system never made (or for
    // rows already purged). Acknowledge so the provider stops retrying.
    logger.info(
      { provider: event.provider, locatorKind: event.locator.kind, event: 'email_bounce_unmatched' },
      '[EmailBounce] No outbound message matched the bounce',
    );
    return 'unmatched';
  }

  if (message.sendStatus === 'bounced') return 'already_recorded';

  // Scoped by organizationId as well as id so a bounce can never write across a
  // tenant boundary even if two providers ever collide on a message id.
  const updated = await db.message.updateMany({
    where: {
      id: message.id,
      organizationId: message.organizationId,
      sendStatus: { not: 'bounced' },
    },
    data: {
      sendStatus: 'bounced',
      sendError: event.detail ?? `${event.provider} reported a ${event.bounceType ?? 'bounce'}`,
    },
  });

  if (updated.count === 0) return 'already_recorded';

  await db.message.create({
    data: {
      threadId: message.threadId,
      organizationId: message.organizationId,
      senderType: SenderType.note,
      contentText: noteText(event),
    },
  });

  logger.warn(
    {
      provider: event.provider,
      organizationId: message.organizationId,
      threadId: message.threadId,
      messageId: message.id,
      bounceType: event.bounceType,
      permanent: event.permanent,
      opsAlert: true,
      category: 'email_bounce',
    },
    '[EmailBounce] Outbound email bounced',
  );

  return 'recorded';
}
