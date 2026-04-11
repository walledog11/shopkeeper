import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import logger from '@/lib/logger';
import { ServerClient } from 'postmark';
import twilio from 'twilio';
import { CHANNEL_TYPE, THREAD_STATUS } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    // 60 outbound messages per minute per org — prevents accidental or malicious message floods
    const rl = await rateLimit(`messages:send:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { threadId, text, isNote } = await request.json();

    if (!threadId || !text) {
      return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
    }

    if (text.length > 4000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    // Fetch thread with full data needed for dispatch
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: { customer: true },
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Notes are internal only — skip all channel dispatch, save immediately
    if (isNote) {
      const message = await db.message.create({
        data: { threadId, senderType: SenderType.note, contentText: text },
      });
      return NextResponse.json(message);
    }

    const recipientId = thread.customer.platformId;

    // -------------------------------------------------------------
    // DISPATCH BRANCH: INSTAGRAM
    // Save to DB only after successful dispatch.
    // -------------------------------------------------------------
    if (thread.channelType === CHANNEL_TYPE.IG_DM) {
      const igIntegration = await db.integration.findFirst({
        where: { organizationId: org.id, platform: CHANNEL_TYPE.IG_DM },
      });
      const igToken = igIntegration?.accessToken;
      const igAccountId = igIntegration?.externalAccountId;

      if (!igToken || !igAccountId) {
        return NextResponse.json({ error: 'No Instagram integration configured' }, { status: 502 });
      }

      const metaResponse = await fetch(`https://graph.facebook.com/v22.0/${igAccountId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${igToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      });

      if (!metaResponse.ok) {
        const err = await metaResponse.text();
        logger.error({ err }, '[Dispatch] Meta API failed');
        return NextResponse.json({ error: 'Failed to send via Instagram' }, { status: 502 });
      }
    }
    // -------------------------------------------------------------
    // DISPATCH BRANCH: EMAIL
    // -------------------------------------------------------------
    else if (thread.channelType === CHANNEL_TYPE.EMAIL) {
      const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
      if (!POSTMARK_API_KEY) {
        return NextResponse.json({ error: 'Email not configured — missing POSTMARK_API_KEY' }, { status: 502 });
      }

      const integration = await db.integration.findFirst({
        where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
      });

      if (!integration) {
        return NextResponse.json({ error: 'No email integration configured' }, { status: 502 });
      }

      const client = new ServerClient(POSTMARK_API_KEY);
      const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || 'mail.clerkapp.com';
      const syntheticMessageId = `<thread-${threadId}@${INBOUND_DOMAIN}>`;
      const fromEmail = integration.fromEmail || integration.externalAccountId;

      const lastCustomerMsg = await db.message.findFirst({
        where: { threadId, senderType: SenderType.customer, externalMessageId: { not: null } },
        orderBy: { sentAt: 'desc' },
        select: { externalMessageId: true },
      });
      const inReplyTo = lastCustomerMsg?.externalMessageId ?? syntheticMessageId;

      await client.sendEmail({
        From: `${org.name} <${fromEmail}>`,
        ReplyTo: integration.externalAccountId,
        To: recipientId,
        Subject: `Re: ${thread.tag || 'Your inquiry'}`,
        TextBody: text,
        Headers: [
          { Name: 'Message-ID', Value: syntheticMessageId },
          { Name: 'In-Reply-To', Value: inReplyTo },
          { Name: 'References', Value: inReplyTo },
        ],
      });
    }
    // -------------------------------------------------------------
    // DISPATCH BRANCH: SMS
    // -------------------------------------------------------------
    else if (thread.channelType === CHANNEL_TYPE.SMS) {
      const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
      const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
      const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        return NextResponse.json({ error: 'SMS not configured — missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER' }, { status: 502 });
      }

      const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      await twilioClient.messages.create({
        body: text,
        from: TWILIO_FROM_NUMBER,
        to: recipientId,
      });
    }

    // -------------------------------------------------------------
    // DISPATCH BRANCH: SHOPIFY
    // -------------------------------------------------------------
    else if (thread.channelType === CHANNEL_TYPE.SHOPIFY) {
      return NextResponse.json(
        { error: 'Shopify outbound messaging is not yet implemented' },
        { status: 501 }
      );
    }

    // Dispatch succeeded — now save the message to DB
    const message = await db.message.create({
      data: { threadId, senderType: SenderType.agent, contentText: text },
    });
    await db.thread.update({
      where: { id: threadId },
      data: { status: THREAD_STATUS.OPEN },
    });

    return NextResponse.json(message);

  } catch (error) {
    return handleApiError(error, 'Messages POST', 'Failed to process message');
  }
}
