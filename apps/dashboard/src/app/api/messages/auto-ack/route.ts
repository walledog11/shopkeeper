/**
 * Internal Auto-Acknowledgment API — called by the gateway worker when an
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
import { resolveAgentSettings } from '@/lib/agent/settings';
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

    const { threadId } = await request.json() as { threadId?: string };
    if (!threadId) {
      return NextResponse.json({ error: 'Missing threadId' }, { status: 400 });
    }

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
    const settings = resolveAgentSettings(org.settings as Parameters<typeof resolveAgentSettings>[0]);

    // Guard: empty message means misconfiguration — the gateway decides when to call this endpoint.
    if (!settings.autoAckMessage.trim()) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await dispatchMessage(thread, org, settings.autoAckMessage);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Messages auto-ack POST', 'Failed to send auto-acknowledgment');
  }
}
