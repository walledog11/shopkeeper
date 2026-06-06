import { db, SenderType, createMessage } from '@clerk/db';
import logger from '@/lib/server/logger';
import { CHANNEL_TYPE, THREAD_STATUS } from '@clerk/agent/thread-constants';
import { recordOutboundCall } from '@/lib/server/outbound-recorder';
import { getEmailSender, getEmailProvider, EmailNotConfiguredError } from '@/lib/messaging/email';
import { buildThreadReplyHeaders, formatReplySubject } from '@/lib/messaging/email/reply';
import {
  recordEmailSendFailure,
  recordInstagramSendFailure,
} from '@/lib/messaging/provider-send-failures';
import type { OutboundSource } from '@/lib/server/outbound-recorder';

interface DispatchThread {
  id: string;
  channelType: string;
  organizationId: string;
  customer: { platformId: string };
}

interface DispatchOrg {
  id: string;
  name: string;
}

interface DispatchMessageOptions {
  source?: Extract<OutboundSource, 'dispatch_message' | 'agent_send_reply'>;
  emailSubjectFallback?: string;
}

export type DispatchMessageResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string; providerStatus?: number };

/**
 * Dispatches text to the customer via the thread's channel, then saves
 * the message to DB and sets the thread status to open.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function dispatchMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  options: DispatchMessageOptions = {},
): Promise<DispatchMessageResult> {
  const recipientId = thread.customer.platformId;
  const source = options.source ?? 'dispatch_message';

  if (thread.channelType === CHANNEL_TYPE.IG_DM) {
    const igIntegration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: CHANNEL_TYPE.IG_DM },
    });
    const igToken = igIntegration?.accessToken;
    const igAccountId = igIntegration?.externalAccountId;

    if (!igAccountId) {
      return { ok: false, error: 'No Instagram integration configured' };
    }

    const recorded = await recordOutboundCall({
      source,
      provider: 'meta',
      channel: 'ig_dm',
      organizationId: org.id,
      threadId: thread.id,
      to: recipientId,
      from: igAccountId,
      text,
      metadata: { igAccountId },
    });
    if (!recorded && !igToken) {
      return { ok: false, error: 'No Instagram integration configured' };
    }

    if (!recorded) {
      const metaRes = await fetch(`https://graph.facebook.com/v22.0/${igAccountId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${igToken}` },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
      });

      if (!metaRes.ok) {
        const errBody = await metaRes.json().catch(() => ({})) as {
          error?: { code?: number; error_subcode?: number };
        };
        const code = errBody.error?.code;
        const subcode = errBody.error?.error_subcode;
        const isExpired = code === 190;
        const isOutsideWindow = code === 10 && subcode === 2018278;
        const userMessage = isOutsideWindow
          ? "Instagram only allows replies within 24 hours of the customer's last message"
          : isExpired
            ? 'Instagram token expired'
            : 'Failed to send via Instagram';
        const detail = isOutsideWindow
          ? 'Outside Instagram 24-hour messaging window'
          : isExpired
            ? 'Instagram token expired'
            : 'Meta Graph API returned non-OK';
        logger.error({ err: errBody }, '[dispatchMessage] Meta API failed');
        await recordInstagramSendFailure({
          organizationId: org.id,
          threadId: thread.id,
          integrationId: igIntegration?.id ?? null,
          detail,
        });
        return { ok: false, error: userMessage, providerStatus: metaRes.status };
      }
    }

  } else if (thread.channelType === CHANNEL_TYPE.EMAIL) {
    const r = await sendEmail(thread, org, text, {
      source,
      subjectFallback: options.emailSubjectFallback,
    });
    if (!r.ok) return r;

  } else if (thread.channelType === CHANNEL_TYPE.SHOPIFY) {
    const r = await sendEmail(thread, org, text, {
      source,
      subjectFallback: options.emailSubjectFallback,
      originalChannel: CHANNEL_TYPE.SHOPIFY,
    });
    if (!r.ok) return r;
  } else {
    return { ok: false, error: 'Unsupported channel' };
  }

  await createMessage(
    { threadId: thread.id, senderType: SenderType.agent, contentText: text },
    { status: THREAD_STATUS.OPEN },
  );

  return { ok: true };
}

async function sendEmail(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  opts: {
    source: Extract<OutboundSource, 'dispatch_message' | 'agent_send_reply'>;
    subjectFallback?: string;
    originalChannel?: string;
  },
): Promise<DispatchMessageResult> {
  const integration = await db.integration.findFirst({
    where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
  });
  if (!integration) return { ok: false, error: 'No email integration configured' };

  const threadCtx = await db.thread.findUnique({
    where: { id: thread.id },
    select: {
      subject: true,
      messages: {
        where: { senderType: SenderType.customer, externalMessageId: { not: null } },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { externalMessageId: true },
      },
    },
  });

  const fromEmail = integration.fromEmail || integration.externalAccountId;
  const subject = formatReplySubject(threadCtx?.subject, opts.subjectFallback);
  const headers = buildThreadReplyHeaders(thread.id, threadCtx?.messages[0]?.externalMessageId);

  const provider = getEmailProvider(integration);
  const recorded = await recordOutboundCall({
    source: opts.source,
    provider,
    channel: 'email',
    organizationId: org.id,
    threadId: thread.id,
    to: thread.customer.platformId,
    from: fromEmail,
    subject,
    text,
    headers,
    metadata: {
      replyTo: integration.externalAccountId,
      ...(opts.originalChannel && { originalChannel: opts.originalChannel }),
    },
  });
  if (recorded) return { ok: true };

  try {
    await getEmailSender(integration).send({
      to: thread.customer.platformId,
      fromAddress: fromEmail,
      fromName: org.name,
      replyTo: integration.externalAccountId,
      subject,
      text,
      headers,
    });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      return { ok: false, error: 'Email not configured', detail: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: msg, originalChannel: opts.originalChannel },
      '[dispatchMessage] Email send failed',
    );
    await recordEmailSendFailure({
      provider,
      organizationId: org.id,
      threadId: thread.id,
      integrationId: integration.id,
      detail: msg,
      originalChannel: opts.originalChannel,
    });
    return { ok: false, error: 'Email dispatch failed', detail: msg };
  }

  return { ok: true };
}
