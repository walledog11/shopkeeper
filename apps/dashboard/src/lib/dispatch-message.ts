import { db, SenderType } from '@clerk/db';
import { ServerClient } from 'postmark';
import twilio from 'twilio';
import logger from './logger';
import { CHANNEL_TYPE, THREAD_STATUS } from './constants';

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

    if (!igToken || !igAccountId) {
      return { ok: false, error: 'No Instagram integration configured' };
    }

    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${igAccountId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${igToken}` },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });

    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({})) as { error?: { code?: number } };
      const isExpired = errBody.error?.code === 190;
      logger.error({ err: errBody }, '[dispatchMessage] Meta API failed');
      return { ok: false, error: isExpired ? 'Instagram token expired' : 'Failed to send via Instagram' };
    }

  } else if (thread.channelType === CHANNEL_TYPE.EMAIL) {
    const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
    if (!POSTMARK_API_KEY) return { ok: false, error: 'Email not configured' };

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
    });
    if (!integration) return { ok: false, error: 'No email integration configured' };

    const client = new ServerClient(POSTMARK_API_KEY);
    const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || 'mail.clerkapp.com';
    const syntheticMessageId = `<thread-${thread.id}@${INBOUND_DOMAIN}>`;
    const fromEmail = integration.fromEmail || integration.externalAccountId;

    const lastCustomerMsg = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.customer, externalMessageId: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { externalMessageId: true },
    });
    const inReplyTo = lastCustomerMsg?.externalMessageId ?? syntheticMessageId;

    await client.sendEmail({
      From: `${org.name} <${fromEmail}>`,
      ReplyTo: integration.externalAccountId,
      To: recipientId,
      Subject: `Re: Your inquiry`,
      TextBody: text,
      Headers: [
        { Name: 'Message-ID', Value: syntheticMessageId },
        { Name: 'In-Reply-To', Value: inReplyTo },
        { Name: 'References', Value: inReplyTo },
      ],
    });

  } else if (thread.channelType === CHANNEL_TYPE.SMS) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      return { ok: false, error: 'SMS not configured' };
    }
    const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await twilioClient.messages.create({ body: text, from: TWILIO_FROM_NUMBER, to: recipientId });

  } else if (thread.channelType === CHANNEL_TYPE.SHOPIFY) {
    return { ok: false, error: 'Shopify outbound messaging is not yet implemented' };
  }

  await db.message.create({
    data: { threadId: thread.id, senderType: SenderType.agent, contentText: text },
  });
  await db.thread.update({
    where: { id: thread.id },
    data: { status: THREAD_STATUS.OPEN },
  });

  return { ok: true };
}
