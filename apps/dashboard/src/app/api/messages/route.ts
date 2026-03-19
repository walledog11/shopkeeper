import { NextResponse } from 'next/server';
import { db } from '@clerk/db';

export async function POST(request: Request) {
  try {
    const { threadId, text } = await request.json();

    if (!threadId || !text) {
      return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
    }

    // 1. COMBINED: Update thread, create message, and fetch customer in one query!
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
        const metaResponse = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      
      // TODO: Add your Email Provider API call here!
      // Example using Resend or SendGrid:
      /*
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'support@yourclothingbrand.com',
          to: recipientId,
          subject: `Re: ${updatedThread.tag}`, // Replying to their original subject
          text: text
        })
      });
      */
      console.log('[Dispatch] Email sending logic goes here!');
    }

    return NextResponse.json(newMessage);
    
  } catch (error) {
    console.error('[Next.js API] Failed to process outbound message:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}