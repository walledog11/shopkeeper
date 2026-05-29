/**
 * Internal Send-Message API , called by the gateway when the merchant
 * issues a `REPLY <n> <text>` command from the daily WhatsApp digest.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { threadId, text }
 * Response: 200 on success, 4xx/5xx on error.
 */
import { NextResponse } from 'next/server';
import { db, ThreadFilterStatus, ThreadFilterFeedback } from '@clerk/db';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';
import { handleApiError } from '@/lib/api/errors';
import { timingSafeIncludes, getValidInternalSecrets } from '@/lib/server/auth-utils';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';

export async function POST(request: Request) {
  try {
    const secret = request.headers.get('x-internal-secret') ?? '';
    const validSecrets = getValidInternalSecrets();
    if (!timingSafeIncludes(validSecrets, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId, text } = await request.json() as { threadId?: string; text?: string };
    if (!threadId || !text?.trim()) {
      return NextResponse.json({ error: 'Missing threadId or text' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: true,
        organization: { select: { id: true, name: true, stripeStatus: true } },
      },
    });
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    assertBillingWriteAllowed(thread.organization);

    const result = await dispatchMessage(thread, thread.organization, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Same implicit-feedback rule as the dashboard /api/messages route:
    // an outbound reply on a non-genuine thread means the merchant treats it as legit.
    if (thread.filterStatus !== ThreadFilterStatus.genuine) {
      await db.thread.update({
        where: { id: threadId },
        data: {
          filterFeedback: ThreadFilterFeedback.confirmed_genuine,
          ...(thread.filterStatus === ThreadFilterStatus.filtered && { filterStatus: ThreadFilterStatus.genuine }),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Messages internal POST', 'Failed to send message');
  }
}
