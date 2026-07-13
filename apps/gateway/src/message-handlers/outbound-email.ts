import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { ChannelType, db, SenderType } from '@shopkeeper/db';
import {
  getEmailSender,
  getEmailProvider,
  buildOutboundMessageReplyHeaders,
  formatReplySubject,
  EmailNotConfiguredError,
} from '@shopkeeper/email';
import logger from '../logger.js';
import { captureOutboundReplySent } from '../product-analytics.js';
import type { OutboundEmailJobData } from '../types.js';

// Async outbound email send. The message row is pre-created by the dashboard.
// A conditional database claim is the cross-worker correctness boundary; once
// a provider attempt starts, an interrupted claim becomes `unknown` instead of
// being blindly retried because Postmark/Gmail do not provide a shared request
// idempotency contract.
export interface OutboundEmailFailureHooks {
  afterProviderAccepted?: () => Promise<void> | void;
}

export async function handleOutboundEmailJob(
  job: Job<OutboundEmailJobData>,
  failureHooksOrWorkerToken: OutboundEmailFailureHooks | string = {},
): Promise<void> {
  const failureHooks = typeof failureHooksOrWorkerToken === 'string'
    ? {}
    : failureHooksOrWorkerToken;
  const {
    messageId,
    integrationId,
    replySource,
    source,
    organizationId,
    traceId,
  } = job.data;
  const analyticsReplySource = replySource
    ?? (source === 'agent_send_reply' || source === 'agent_send_email'
      ? 'agent_approved'
      : 'manual');

  const [message, integration] = await Promise.all([
    db.message.findFirst({
      where: {
        id: messageId,
        organizationId,
        threadId: job.data.threadId,
        thread: { organizationId },
      },
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
    }),
    db.integration.findFirst({
      where: {
        id: integrationId,
        organizationId,
        platform: ChannelType.email,
      },
    }),
  ]);

  if (!message || !integration) {
    logger.error(
      {
        opsAlert: true,
        messageId,
        integrationId,
        organizationId,
        threadId: job.data.threadId,
        traceId,
      },
      '[OutboundEmail] Resource ownership mismatch — dropping',
    );
    return;
  }

  // Idempotency: a prior attempt already delivered this message.
  if (message.sendStatus === 'sent') {
    logger.info({ messageId, traceId }, '[OutboundEmail] Message already sent — skipping');
    void captureOutboundReplySent({
      channel: 'email',
      messageId,
      organizationId,
      replySource: analyticsReplySource,
    });
    return;
  }

  const claimToken = randomUUID();
  const claimed = await db.message.updateMany({
    where: {
      id: messageId,
      organizationId,
      threadId: job.data.threadId,
      sendStatus: 'pending',
    },
    data: {
      sendStatus: 'processing',
      sendClaimToken: claimToken,
      sendClaimedAt: new Date(),
      sendAttemptedAt: null,
      sendError: null,
    },
  });
  if (claimed.count !== 1) {
    logger.info(
      { messageId, sendStatus: message.sendStatus, traceId },
      '[OutboundEmail] Message is not claimable — skipping duplicate job',
    );
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
  const headers = buildOutboundMessageReplyHeaders(message.thread.id, message.id, inReplyTo);

  const attempted = await db.message.updateMany({
    where: {
      id: messageId,
      sendStatus: 'processing',
      sendClaimToken: claimToken,
    },
    data: { sendAttemptedAt: new Date() },
  });
  if (attempted.count !== 1) {
    logger.error({ opsAlert: true, messageId, traceId }, '[OutboundEmail] Delivery claim was lost before provider attempt');
    return;
  }

  let providerMessageId: string;
  try {
    const sent = await getEmailSender(integration).send({
      to: message.thread.customer.platformId,
      fromAddress: fromEmail,
      fromName: message.thread.organization.name,
      replyTo: integration.externalAccountId,
      subject,
      text: message.contentText ?? '',
      headers,
    });
    providerMessageId = sent.providerMessageId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Configuration errors are known to occur before a provider request.
    if (err instanceof EmailNotConfiguredError) {
      await markClaimFailed(messageId, claimToken, msg);
      logger.error({ messageId, provider, traceId }, '[OutboundEmail] Email not configured');
      return;
    }

    // Transport and provider errors after the request starts are ambiguous. A
    // retry could duplicate a message that the provider already accepted.
    await markClaimUnknown(messageId, claimToken, msg);
    logger.error(
      { opsAlert: true, err: msg, messageId, provider, source, organizationId, traceId },
      '[OutboundEmail] Provider outcome is unknown; automatic retry suppressed',
    );
    return;
  }

  await failureHooks.afterProviderAccepted?.();

  const committed = await db.message.updateMany({
    where: {
      id: messageId,
      sendStatus: 'processing',
      sendClaimToken: claimToken,
    },
    data: {
      sendStatus: 'sent',
      sendClaimToken: null,
      providerMessageId,
      sendError: null,
    },
  });
  if (committed.count !== 1) {
    throw new Error('Outbound email provider accepted the message but its delivery claim could not be committed.');
  }

  void captureOutboundReplySent({
    channel: 'email',
    messageId,
    organizationId,
    replySource: analyticsReplySource,
  });
}

async function markClaimFailed(messageId: string, claimToken: string, error: string): Promise<void> {
  await db.message.updateMany({
    where: { id: messageId, sendStatus: 'processing', sendClaimToken: claimToken },
    data: {
      sendStatus: 'failed',
      sendClaimToken: null,
      sendError: error.slice(0, 2000),
    },
  });
}

async function markClaimUnknown(messageId: string, claimToken: string, error: string): Promise<void> {
  await db.message.updateMany({
    where: { id: messageId, sendStatus: 'processing', sendClaimToken: claimToken },
    data: {
      sendStatus: 'unknown',
      sendClaimToken: null,
      sendError: error.slice(0, 2000),
    },
  });
}
