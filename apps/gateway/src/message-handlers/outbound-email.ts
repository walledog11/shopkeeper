import type { Job } from 'bullmq';
import { db, SenderType } from '@shopkeeper/db';
import {
  getEmailSender,
  getEmailProvider,
  buildThreadReplyHeaders,
  formatReplySubject,
  EmailNotConfiguredError,
} from '@shopkeeper/email';
import logger from '../logger.js';
import type { OutboundEmailJobData } from '../types.js';

// Phase 1.5: async outbound email send. The message row is pre-created by the
// caller (dashboard) with sendStatus 'pending'; this worker performs the actual
// provider send and transitions the row to 'sent' or 'failed'. Idempotent under
// at-least-once delivery via the sendStatus gate.
export async function handleOutboundEmailJob(job: Job<OutboundEmailJobData>): Promise<void> {
  const { messageId, integrationId, source, organizationId, traceId } = job.data;

  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      contentText: true,
      sendStatus: true,
      thread: {
        select: {
          id: true,
          subject: true,
          organization: { select: { name: true } },
          customer: { select: { platformId: true } },
          messages: {
            where: { senderType: SenderType.customer, externalMessageId: { not: null } },
            orderBy: { sentAt: 'desc' },
            take: 1,
            select: { externalMessageId: true },
          },
        },
      },
    },
  });

  if (!message) {
    logger.error({ messageId, traceId }, '[OutboundEmail] Message not found — dropping');
    return;
  }

  // Idempotency: a prior attempt already delivered this message.
  if (message.sendStatus === 'sent') {
    logger.info({ messageId, traceId }, '[OutboundEmail] Message already sent — skipping');
    return;
  }

  const integration = await db.integration.findUnique({ where: { id: integrationId } });
  if (!integration) {
    await markFailed(messageId, 'No email integration configured');
    logger.error({ messageId, integrationId, traceId }, '[OutboundEmail] Integration not found');
    return;
  }

  const provider = getEmailProvider(integration);
  const fromEmail = integration.fromEmail || integration.externalAccountId;
  const inReplyTo = message.thread.messages[0]?.externalMessageId;
  // agent_send_email opening a brand-new thread (no inbound customer message) is
  // a fresh email — send the agent's chosen subject verbatim. Every other case
  // is a reply and gets the "Re: " prefix.
  const isNewAgentEmail = source === 'agent_send_email' && !inReplyTo;
  const subject = isNewAgentEmail
    ? message.thread.subject?.trim() || 'Your inquiry'
    : formatReplySubject(message.thread.subject);
  const headers = buildThreadReplyHeaders(message.thread.id, inReplyTo);

  try {
    await getEmailSender(integration).send({
      to: message.thread.customer.platformId,
      fromAddress: fromEmail,
      fromName: message.thread.organization.name,
      replyTo: integration.externalAccountId,
      subject,
      text: message.contentText ?? '',
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Configuration errors are not retryable — fail fast.
    if (err instanceof EmailNotConfiguredError) {
      await markFailed(messageId, msg);
      logger.error({ messageId, provider, traceId }, '[OutboundEmail] Email not configured');
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;
    if (isFinalAttempt) {
      await markFailed(messageId, msg);
      logger.error(
        { opsAlert: true, err: msg, messageId, provider, source, organizationId, traceId },
        '[OutboundEmail] Send failed permanently',
      );
    }
    // Rethrow so BullMQ records the attempt and retries while attempts remain.
    throw err;
  }

  await db.message.update({
    where: { id: messageId },
    data: { sendStatus: 'sent', sendError: null },
  });
}

async function markFailed(messageId: string, error: string): Promise<void> {
  await db.message.update({
    where: { id: messageId },
    data: { sendStatus: 'failed', sendError: error.slice(0, 2000) },
  });
}
