import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import OpenAI from 'openai';
import { openai } from '@/lib/openai';
import { getOrCreateOrg } from '@/lib/org';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { threadId } = await request.json();

    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
        customer: true,
      }
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert customer support agent for modern clothing brands like Consonant and Palette Garments.
        Your goal is to read the conversation history and draft a helpful, friendly, and concise reply to the customer.
        Do not include placeholders like [Your Name] or [Agent Name]. Just write the exact text the agent should send.`
      },
      ...thread.messages.map((msg) => ({
        role: msg.senderType === 'customer' ? 'user' as const : 'assistant' as const,
        content: msg.contentText || "",
      }))
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
    });

    const draftText = response.choices[0]?.message?.content;

    if (!draftText) {
      return NextResponse.json({ error: 'AI returned an empty response' }, { status: 502 });
    }

    return NextResponse.json({ draft: draftText });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[AI Draft] Failed to generate:', error);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}
