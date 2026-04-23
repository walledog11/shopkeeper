import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { generateText } from '@/lib/ai';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`ai-summary:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
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

    const systemPrompt = `You are an AI assistant summarizing a customer support thread. Write a single short sentence (max 20 words) describing what the customer needs. No labels, no formatting, no status — just the core issue.`;

    const messages = thread.messages.map((msg) => ({
      role: msg.senderType === SenderType.customer ? 'user' as const : 'assistant' as const,
      content: msg.contentText || "",
    }));

    const newSummary = await generateText(systemPrompt, messages, { temperature: 0.5 });

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
