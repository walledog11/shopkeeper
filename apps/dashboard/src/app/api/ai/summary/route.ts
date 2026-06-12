import { NextResponse } from 'next/server';
import { db, SenderType } from '@shopkeeper/db';
import { generateText } from '@shopkeeper/agent/ai';
import { readRequiredJsonObject } from '@/lib/api/body';
import { ApiError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { parseAiSummaryBody } from '@/app/api/ai/summary/_lib/validation';

export const POST = withOrgRoute(
  {
    context: 'AI Summary',
    errorMessage: 'Failed to generate summary',
    rateLimit: { key: 'ai-summary', limit: 10, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { threadId } = parseAiSummaryBody(await readRequiredJsonObject(request));

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
      },
    });
    assertEntityInOrg(thread, org.id, 'Thread not found');

    const systemPrompt = `You are an AI assistant summarizing a customer support thread. Write a single short sentence (max 20 words) describing what the customer needs. No labels, no formatting, no status — just the core issue.`;

    const messages = thread.messages.map((msg) => ({
      role: msg.senderType === SenderType.customer ? 'user' as const : 'assistant' as const,
      content: msg.contentText || "",
    }));

    const newSummary = await generateText(systemPrompt, messages, {
      temperature: 0.5,
      orgId: org.id,
      settings: (org.settings ?? null) as Partial<import('@/types').OrgSettings> | null,
    });

    if (!newSummary) {
      throw new ApiError('AI returned an empty response', 502);
    }

    const updatedThread = await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: newSummary },
    });

    return NextResponse.json({ summary: updatedThread.aiSummary });
  },
);
