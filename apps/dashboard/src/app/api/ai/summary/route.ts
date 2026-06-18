import { NextResponse } from 'next/server';
import { db, SenderType } from '@shopkeeper/db';
import { generateText } from '@shopkeeper/agent/ai';
import { readRequiredJsonObject } from '@/lib/api/body';
import { ApiError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { parseAiSummaryBody } from '@/app/api/ai/summary/_lib/validation';

function fallbackTitleFromSummary(summary: string): string {
  const stripped = summary
    .replace(/^\s*(the\s+)?customer\s+(is\s+|are\s+|was\s+|were\s+|has\s+|have\s+|had\s+|been\s+)*/i, '')
    .replace(/[.?!]+$/, '')
    .trim();
  const base = stripped || summary.trim();
  if (!base) return 'New message';
  const titled = base[0].toUpperCase() + base.slice(1);
  return titled.length > 70 ? `${titled.slice(0, 67)}...` : titled;
}

function parseSummaryRefreshResponse(raw: string): { title: string; summary: string } {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { title?: unknown; summary?: unknown };
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    if (summary) {
      return {
        title: title || fallbackTitleFromSummary(summary),
        summary,
      };
    }
  } catch {
    // Fall through to the plain-text fallback for older/non-JSON responses.
  }

  if (!cleaned) {
    throw new ApiError('AI returned an empty response', 502);
  }

  return {
    title: fallbackTitleFromSummary(cleaned),
    summary: cleaned,
  };
}

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

    const systemPrompt = `You are an AI assistant summarizing a customer support thread.
Return strict JSON with:
- "title": a short subject line, 3 to 6 words, Title Case, no trailing period, never starting with "Customer" or "The customer".
- "summary": one short sentence, max 20 words, describing what the customer needs.
No labels or markdown. Respond only as {"title":"...","summary":"..."}.`;

    const messages = thread.messages.map((msg) => ({
      role: msg.senderType === SenderType.customer ? 'user' as const : 'assistant' as const,
      content: msg.contentText || "",
    }));

    const refreshText = await generateText(systemPrompt, messages, {
      temperature: 0.5,
      orgId: org.id,
      settings: (org.settings ?? null) as Partial<import('@/types').OrgSettings> | null,
    });

    if (!refreshText) {
      throw new ApiError('AI returned an empty response', 502);
    }
    const refreshed = parseSummaryRefreshResponse(refreshText);

    const updatedThread = await db.thread.update({
      where: { id: threadId },
      data: {
        aiTitle: refreshed.title,
        aiSummary: refreshed.summary,
      },
    });

    return NextResponse.json({
      title: updatedThread.aiTitle,
      summary: updatedThread.aiSummary,
    });
  },
);
