import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { ServerClient } from 'postmark';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { threadId, text } = await request.json();

    if (!threadId || !text) {
      return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
    }

    // Verify the thread belongs to this org before touching it
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: { organizationId: true },
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const updatedThread = await db.thread.update({
      where: { id: threadId },
      data: {
        status: 'open',
        messages: {
          create: {
            senderType: 'agent',
            contentText: text,
          }
        }
      },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1
        }
      }
    });

    const newMessage = updatedThread.messages[0];
    const recipientId = updatedThread.customer.platformId;

    // -------------------------------------------------------------
    // DISPATCH BRANCH: INSTAGRAM
    // -------------------------------------------------------------
    if (updatedThread.channelType === 'ig_dm') {
      console.log(`[Dispatch] Preparing to send message to IG User: ${recipientId}`);

      const igIntegration = await db.integration.findFirst({
        where: { organizationId: org.id, platform: 'ig_dm' },
      });
      const PAGE_ACCESS_TOKEN = igIntegration?.accessToken;

      if (PAGE_ACCESS_TOKEN) {
        const metaResponse = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PAGE_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: text }
          })
        });
        const metaResult = await metaResponse.json();
        console.log('[Dispatch] Meta API Response:', metaResult);
      } else {
        console.warn('[Dispatch] WARNING: No ig_dm integration found for this org — message saved but not sent.');
      }
    }
    // -------------------------------------------------------------
    // DISPATCH BRANCH: EMAIL
    // -------------------------------------------------------------
    else if (updatedThread.channelType === 'email') {
      console.log(`[Dispatch] Preparing to send email reply to: ${recipientId}`);

      const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
      if (!POSTMARK_API_KEY) {
        console.warn('[Dispatch] WARNING: No POSTMARK_API_KEY found in .env — message saved but not sent.');
      } else {
        const integration = await db.integration.findFirst({
          where: { organizationId: org.id, platform: 'email' },
        });

        if (!integration) {
          console.warn('[Dispatch] WARNING: No email integration found for this org — message saved but not sent.');
        } else {
          try {
            const client = new ServerClient(POSTMARK_API_KEY);
            const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || 'mail.clerkapp.com';
            const threadMessageId = `<thread-${threadId}@${INBOUND_DOMAIN}>`;

            const result = await client.sendEmail({
              From: integration.fromEmail || integration.externalAccountId,
              ReplyTo: integration.externalAccountId,
              To: recipientId,
              Subject: `Re: ${updatedThread.tag || 'Your inquiry'}`,
              TextBody: text,
              Headers: [
                { Name: 'Message-ID', Value: threadMessageId },
                { Name: 'In-Reply-To', Value: threadMessageId },
                { Name: 'References', Value: threadMessageId },
              ],
            });
            console.log(`[Dispatch] Postmark message sent. MessageID: ${result.MessageID}`);
          } catch (sendError) {
            console.error('[Dispatch] Postmark send failed — message saved to DB but email not delivered:', sendError);
          }
        }
      }
    }

    return NextResponse.json(newMessage);

  } catch (error) {
    return handleApiError(error, 'Messages POST', 'Failed to process message');
  }
}
