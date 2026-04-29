import { NextResponse } from 'next/server';
import { db, SenderType, createMessage } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    // 60 outbound messages per minute per org — prevents accidental or malicious message floods
    const rl = await rateLimit(`messages:send:${org.id}`, 60, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { threadId, text, isNote } = await request.json();

    if (!threadId || !text) {
      return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
    }

    if (text.length > 4000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: { customer: true },
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    if (isNote) {
      const message = await createMessage({
        threadId,
        senderType: SenderType.note,
        contentText: text,
      });
      return NextResponse.json(message);
    }

    const result = await dispatchMessage(thread, org, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Implicit-genuine feedback: replying to a non-genuine thread implies the merchant
    // sees it as legit. Promote filtered → genuine; capture feedback either way.
    if (thread.filterStatus !== 'genuine') {
      await db.thread.update({
        where: { id: threadId },
        data: {
          filterFeedback: 'confirmed_genuine',
          ...(thread.filterStatus === 'filtered' && { filterStatus: 'genuine' }),
        },
      });
    }

    const message = await db.message.findFirst({
      where: { threadId, senderType: SenderType.agent },
      orderBy: { sentAt: 'desc' },
    });

    return NextResponse.json(message);
  } catch (error) {
    return handleApiError(error, 'Messages POST', 'Failed to process message');
  }
}
