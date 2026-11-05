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
import { loadAutoAckThread, sendAutoAcknowledgement } from '@shopkeeper/messaging';
import { dispatchAcknowledgement, dispatchMessage } from '@/lib/messaging/dispatch-message';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withInternalRoute } from '@/lib/api/internal-route';
import { parseAutoAckBody } from '@/app/api/messages/_lib/validation';

export const POST = withInternalRoute(
  {
    context: 'Messages auto-ack POST',
    errorMessage: 'Failed to send auto-acknowledgment',
  },
  async ({ request }) => {
    const { threadId, kind } = parseAutoAckBody(await readRequiredJsonObject(request));

    const thread = await loadAutoAckThread(threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const result = await sendAutoAcknowledgement(thread, kind, {
      acknowledge: dispatchAcknowledgement,
      dispatch: dispatchMessage,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.outcome && { outcome: result.outcome }) }, { status: 502 });
    }
    return NextResponse.json(result.skipped ? { ok: true, skipped: true } : { ok: true });
  },
);
