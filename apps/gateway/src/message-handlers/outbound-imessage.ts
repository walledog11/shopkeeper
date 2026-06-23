import type { Job } from 'bullmq';
import { db } from '@shopkeeper/db';
import { imessage } from 'spectrum-ts/providers/imessage';
import { getSpectrumAppForIntegration, SpectrumIntegrationConfigError } from '../clients/spectrum.js';
import logger from '../logger.js';
import type { OutboundImessageJobData } from '../types.js';

// Async outbound iMessage send, mirroring the outbound-email worker. The message
// row is pre-created by the dashboard with sendStatus 'pending'; this worker
// reconstructs the Space from the stored externalSpaceId and performs the send,
// transitioning the row to 'sent' or 'failed'.
//
// Retry-safety note: spectrum-ts has no clientGuid / idempotency key on send(),
// so dedupe across at-least-once delivery rests solely on the sendStatus gate —
// a crash between a successful send and the 'sent' flip can duplicate the
// message. iMessage has no delivery webhook to reconcile against, so a send-ack
// is treated as best-effort and never implies delivery certainty.
export async function handleOutboundImessageJob(job: Job<OutboundImessageJobData>): Promise<void> {
  const { messageId, integrationId, source, organizationId, traceId } = job.data;

  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      contentText: true,
      sendStatus: true,
      thread: {
        select: {
          externalSpaceId: true,
        },
      },
    },
  });

  if (!message) {
    logger.error({ messageId, traceId }, '[OutboundImessage] Message not found — dropping');
    return;
  }

  // Idempotency: a prior attempt already delivered this message.
  if (message.sendStatus === 'sent') {
    logger.info({ messageId, traceId }, '[OutboundImessage] Message already sent — skipping');
    return;
  }

  const integration = await db.integration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      organizationId: true,
      platform: true,
      externalAccountId: true,
      accessToken: true,
      refreshToken: true,
    },
  });
  if (!integration) {
    await markFailed(messageId, 'No iMessage integration configured');
    logger.error({ messageId, integrationId, traceId }, '[OutboundImessage] Integration not found');
    return;
  }

  // Inbound-first: never open a cold iMessage conversation. The dashboard
  // dispatch guard already refuses sends without a Space, so a missing
  // externalSpaceId here means a stale job — fail it rather than cold-start a
  // conversation (Apple bans lines for proactive outbound).
  const externalSpaceId = message.thread.externalSpaceId?.trim();
  if (!externalSpaceId) {
    await markFailed(messageId, 'No inbound iMessage conversation to reply into');
    logger.error(
      { messageId, integrationId, traceId },
      '[OutboundImessage] Refusing cold outbound — no externalSpaceId',
    );
    return;
  }

  try {
    const app = await getSpectrumAppForIntegration(integration);
    const im = imessage(app);
    const space = await im.space.get(externalSpaceId);
    await space.send(stripMarkdown(message.contentText ?? ''));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Misconfigured credentials are not retryable — fail fast.
    if (err instanceof SpectrumIntegrationConfigError) {
      await markFailed(messageId, msg);
      logger.error({ messageId, integrationId, traceId }, '[OutboundImessage] Spectrum not configured');
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;
    if (isFinalAttempt) {
      await markFailed(messageId, msg);
      logger.error(
        { opsAlert: true, err: msg, messageId, source, organizationId, traceId },
        '[OutboundImessage] Send failed permanently',
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

// iMessage bubbles have no markdown renderer, so emphasis/headers/links/code
// fences from LLM-drafted replies would otherwise show their literal syntax
// characters. Flatten common markdown to plain text before sending. Word-internal
// underscores (snake_case identifiers, order ids) are left untouched.
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, code: string) => code.trim())
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .trim();
}

async function markFailed(messageId: string, error: string): Promise<void> {
  await db.message.update({
    where: { id: messageId },
    data: { sendStatus: 'failed', sendError: error.slice(0, 2000) },
  });
}
