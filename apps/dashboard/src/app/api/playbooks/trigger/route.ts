import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';
import { NotFoundError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { readRequiredJsonObject } from '@/lib/api/body';
import { parseTriggerPlaybooksBody } from '@/app/api/playbooks/_lib/playbook-shape';
import { withInternalRoute } from '@/lib/api/internal-route';

export const POST = withInternalRoute(
  {
    context: 'Playbooks trigger POST',
    errorMessage: 'Failed to trigger playbooks',
  },
  async ({ request }) => {
    const { organizationId, threadId, trigger } = parseTriggerPlaybooksBody(await readRequiredJsonObject(request, {
      malformed: { message: 'Missing required fields' },
      empty: { message: 'Missing required fields' },
      object: { message: 'Missing required fields' },
    }));

    const thread = await db.thread.findFirst({
      where: {
        id: threadId,
        organizationId,
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        organization: { select: { stripeStatus: true } },
      },
    });
    if (!thread) throw new NotFoundError('Thread not found');
    assertBillingWriteAllowed(thread.organization);

    // Fire in background; caller does not need to wait for playbook actions.
    runPlaybooks(organizationId, trigger, threadId);

    return NextResponse.json({ ok: true });
  },
);
