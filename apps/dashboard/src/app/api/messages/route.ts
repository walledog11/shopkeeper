import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';

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
      const PAGE_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
      console.log(`[Dispatch] Preparing to send message to IG User: ${recipientId}`);

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
        console.warn('[Dispatch] WARNING: No META_ACCESS_TOKEN found in .env!');
      }
    }
    // -------------------------------------------------------------
    // DISPATCH BRANCH: EMAIL
    // -------------------------------------------------------------
    else if (updatedThread.channelType === 'email') {
      console.log(`[Dispatch] Preparing to send email reply to: ${recipientId}`);
      console.log('[Dispatch] Email sending logic goes here!');
    }

    return NextResponse.json(newMessage);

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Next.js API] Failed to process outbound message:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
