/**
 * Internal Send-Message API — called by the gateway when the merchant
 * issues a `REPLY <n> <text>` command from the daily operator digest.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { threadId, text }
 * Response: 200 on success, 4xx/5xx on error.
 */
import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';
import { recordMerchantReply } from '@/lib/messaging/merchant-reply';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withInternalRoute } from '@/lib/api/internal-route';
import { parseInternalSendMessageBody } from '@/app/api/messages/_lib/validation';

export const POST = withInternalRoute(
  {
    context: 'Messages internal POST',
    errorMessage: 'Failed to send message',
  },
  async ({ request }) => {
    const { threadId, text } = parseInternalSendMessageBody(await readRequiredJsonObject(request));

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

    await recordMerchantReply(thread);

    return NextResponse.json({ ok: true });
  },
);
