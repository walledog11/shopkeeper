/**
 * Internal Auto-Acknowledgment API — called by the gateway worker when an
 * inbound message arrives outside the org's configured business hours
 * (`after_hours`), or when a messaging-channel request is handed to a person
 * (`handoff`).
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { threadId, kind? }
 * Response: 200 on success or skipped, 4xx/5xx on error.
 */
import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { dispatchAcknowledgement, dispatchMessage } from '@/lib/messaging/dispatch-message';
import { assertBillingWriteAllowed } from '@shopkeeper/db/billing-write-gate';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withInternalRoute } from '@/lib/api/internal-route';
import { parseAutoAckBody } from '@/app/api/messages/_lib/validation';

// The storefront widget's waiting notice, so a customer handed to a person reads
// the same promise on every messaging channel.
const HANDOFF_ACKNOWLEDGEMENT = 'Thanks for your message! Someone from the shop is looking at this and will follow up here.';

export const POST = withInternalRoute(
  {
    context: 'Messages auto-ack POST',
    errorMessage: 'Failed to send auto-acknowledgment',
  },
  async ({ request }) => {
    const { threadId, kind } = parseAutoAckBody(await readRequiredJsonObject(request));

    // Single query — include org so we avoid a second round-trip to Postgres
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

    if (kind === 'handoff') {
      const result = await dispatchAcknowledgement(thread, org, HANDOFF_ACKNOWLEDGEMENT);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      return NextResponse.json(result.skipped ? { ok: true, skipped: true } : { ok: true });
    }

    const settings = resolveAgentSettings(org.settings as Parameters<typeof resolveAgentSettings>[0]);

    // Guard: empty message means misconfiguration — the gateway decides when to call this endpoint.
    if (!settings.autoAckMessage.trim()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await dispatchMessage(thread, org, settings.autoAckMessage, {
      source: 'auto_ack',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  },
);
