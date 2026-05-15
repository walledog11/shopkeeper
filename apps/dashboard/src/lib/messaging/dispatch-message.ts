import { db, SenderType, createMessage } from '@clerk/db';
import logger from '@/lib/server/logger';
import { CHANNEL_TYPE, THREAD_STATUS } from '@/lib/messaging/thread-constants';
import { recordOutboundCall } from '@/lib/server/outbound-recorder';
import { recordProviderSendFailure } from '@/lib/server/provider-send-alerts';
import { getRedis } from '@/lib/server/redis';
import { getEmailSender, getEmailProvider, EmailNotConfiguredError } from '@/lib/messaging/email';
import type { OutboundProvider } from '@/lib/server/outbound-recorder';

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

/**
 * Dispatches text to the customer via the thread's channel, then saves
 * the message to DB and sets the thread status to open.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function dispatchMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const recipientId = thread.customer.platformId;

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
      source: 'dispatch_message',
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
        const errBody = await metaRes.json().catch(() => ({})) as { error?: { code?: number } };
        const isExpired = errBody.error?.code === 190;
        logger.error({ err: errBody }, '[dispatchMessage] Meta API failed');
        await recordProviderSendFailure('meta', 'ig_dm', org.id, {
          counterClient: getRedis(),
          threadId: thread.id,
          integrationId: igIntegration?.id ?? null,
          detail: isExpired ? 'Instagram token expired' : 'Meta Graph API returned non-OK',
        });
        return { ok: false, error: isExpired ? 'Instagram token expired' : 'Failed to send via Instagram' };
      }
    }

  } else if (thread.channelType === CHANNEL_TYPE.EMAIL) {
    const r = await sendEmail(thread, org, text);
    if (!r.ok) return r;

  } else if (thread.channelType === CHANNEL_TYPE.SHOPIFY) {
    const r = await sendEmail(thread, org, text, { originalChannel: CHANNEL_TYPE.SHOPIFY });
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
  opts: { originalChannel?: string } = {},
): Promise<{ ok: boolean; error?: string }> {
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

  const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || 'mail.clerkapp.com';
  const syntheticMessageId = `<thread-${thread.id}@${INBOUND_DOMAIN}>`;
  const fromEmail = integration.fromEmail || integration.externalAccountId;
  const inReplyTo = threadCtx?.messages[0]?.externalMessageId ?? syntheticMessageId;

  const rawSubject = threadCtx?.subject?.trim();
  const subject = rawSubject
    ? (/^re:\s/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`)
    : 'Re: Your inquiry';

  const headers = [
    { name: 'Message-ID', value: syntheticMessageId },
    { name: 'In-Reply-To', value: inReplyTo },
    { name: 'References', value: inReplyTo },
  ];

  const provider: OutboundProvider = getEmailProvider(integration);
  const recorded = await recordOutboundCall({
    source: 'dispatch_message',
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
      return { ok: false, error: 'Email not configured' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: msg, originalChannel: opts.originalChannel },
      '[dispatchMessage] Email send failed',
    );
    await recordProviderSendFailure(provider, 'email', org.id, {
      counterClient: getRedis(),
      threadId: thread.id,
      integrationId: integration.id,
      detail: msg,
      ...(opts.originalChannel && { extra: { originalChannel: opts.originalChannel } }),
    });
    return { ok: false, error: 'Email dispatch failed' };
  }

  return { ok: true };
}
