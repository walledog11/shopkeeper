import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import OpenAI from 'openai';
import { openai } from '@/lib/openai';

export async function POST(request: Request) {
  try {
    const { threadId } = await request.json();

    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
        customer: true
      }
    });

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    // Explicitly type the entire array using OpenAI's built-in type
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert customer support agent for modern clothing brands like Consonant and Palette Garments. 
        Your goal is to read the conversation history and draft a helpful, friendly, and concise reply to the customer. 
        Do not include placeholders like [Your Name] or [Agent Name]. Just write the exact text the agent should send.`
      },
      ...thread.messages.map((msg) => ({
        // Use 'as const' to lock these in as strict literals instead of generic strings
        role: msg.senderType === 'customer' ? 'user' as const : 'assistant' as const,
        content: msg.contentText || "",
      }))
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', 
      messages: messages, // No more 'as any' needed!
      temperature: 0.7, 
    });

    const draftText = response.choices[0].message.content;

    return NextResponse.json({ draft: draftText });

  } catch (error) {
    console.error('[AI Draft] Failed to generate:', error);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}