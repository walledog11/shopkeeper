/**
 * Internal Auto-Acknowledgment API , called by the gateway worker when an
 * inbound message arrives outside the org's configured business hours.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { threadId }
 * Response: 200 on success or skipped, 4xx/5xx on error.
 */
import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { resolveAgentSettings } from '@clerk/agent/settings';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withInternalRoute } from '@/lib/api/internal-route';
import { parseAutoAckBody } from '@/app/api/messages/_lib/validation';

export const POST = withInternalRoute(
  {
    context: 'Messages auto-ack POST',
    errorMessage: 'Failed to send auto-acknowledgment',
  },
  async ({ request }) => {
    const { threadId } = parseAutoAckBody(await readRequiredJsonObject(request));

    // Single query , include org so we avoid a second round-trip to Postgres
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: {
        customer: true,
        organization: { select: { id: true, name: true, settings: true, stripeStatus: true } },
      },
    });
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const org = thread.organization;
    assertBillingWriteAllowed(org);
    const settings = resolveAgentSettings(org.settings as Parameters<typeof resolveAgentSettings>[0]);

    // Guard: empty message means misconfiguration , the gateway decides when to call this endpoint.
    if (!settings.autoAckMessage.trim()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await dispatchMessage(thread, org, settings.autoAckMessage);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  },
);
