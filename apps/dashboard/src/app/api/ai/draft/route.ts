import { NextResponse } from 'next/server';
import { db, SenderType } from '@clerk/db';
import { generateText } from '@/lib/ai';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { excludeAgentTurnMessages } from '@/lib/agent/api/action-log';
import type { OrgSettings } from '@/types';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`ai-draft:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
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

    const settings = org.settings as OrgSettings | null;
    const brandName = settings?.aiContext?.trim() || 'our business';
    const brandVoice = settings?.brandVoice?.trim();

    const systemPrompt = [
      `You are an expert customer support agent for ${brandName}.`,
      brandVoice ? `Tone and voice: ${brandVoice}` : null,
      `Your goal is to read the conversation history and draft a helpful, concise reply to the customer.`,
      `Do not include placeholders like [Your Name] or [Agent Name]. Write only the exact text the agent should send.`,
    ].filter(Boolean).join(' ');

    const messages = excludeAgentTurnMessages(thread.messages)
      .map((msg) => ({
        role: msg.senderType === SenderType.customer ? 'user' as const : 'assistant' as const,
        content: msg.contentText || "",
      }));

    const draftText = await generateText(systemPrompt, messages, { temperature: 0.7 });

    if (!draftText) {
      return NextResponse.json({ error: 'AI returned an empty response' }, { status: 502 });
    }

    return NextResponse.json({ draft: draftText });

  } catch (error) {
    return handleApiError(error, 'AI Draft', 'Failed to generate draft');
  }
}
