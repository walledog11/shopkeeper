import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { threadId } = await request.json();

    // Notice: We only check for threadId here!
    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
    }

    // 1. Fetch the thread and all its messages
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
      }
    });

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    // 2. Format history for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an AI assistant summarizing a customer support thread for Clerk. 
        Provide a concise, 1-2 sentence summary of the customer's core issue and the current status of the resolution.`
      },
      ...thread.messages.map((msg) => ({
        role: msg.senderType === 'customer' ? 'user' as const : 'assistant' as const,
        content: msg.contentText || "",
      }))
    ];

    // 3. Generate the new summary
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', 
      messages: messages,
      temperature: 0.5, 
    });

    const newSummary = response.choices[0].message.content;

    // 4. Save the new summary to the database
    const updatedThread = await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: newSummary }
    });

    return NextResponse.json({ summary: updatedThread.aiSummary });

  } catch (error) {
    console.error('[AI Summary] Failed to generate:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}