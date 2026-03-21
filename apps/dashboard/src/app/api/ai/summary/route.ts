import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import OpenAI from 'openai';
import { openai } from '@/lib/openai';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

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
      }
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.5,
    });

    const newSummary = response.choices[0]?.message?.content;

    if (!newSummary) {
      return NextResponse.json({ error: 'AI returned an empty response' }, { status: 502 });
    }

    const updatedThread = await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: newSummary }
    });

    return NextResponse.json({ summary: updatedThread.aiSummary });

  } catch (error) {
    return handleApiError(error, 'AI Summary', 'Failed to generate summary');
  }
}
