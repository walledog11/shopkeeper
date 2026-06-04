import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { requirePlaybookTrigger } from '@/app/api/playbooks/_lib/playbook-shape';
import { withInternalRoute } from '@/lib/api/internal-route';

export const POST = withInternalRoute(
  {
    context: 'Playbooks trigger POST',
    errorMessage: 'Failed to trigger playbooks',
  },
  async ({ request }) => {
    const body = await readJsonBody(request);
    const { organizationId, threadId, trigger: rawTrigger } = body as {
      organizationId?: unknown;
      threadId?: unknown;
      trigger?: unknown;
    };

    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new BadRequestError('Missing required fields');
    }
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new BadRequestError('Missing required fields');
    }
    const trigger = requirePlaybookTrigger(rawTrigger);

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

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError('Missing required fields');
  }
}
