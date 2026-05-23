import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';
import { BadRequestError, NotFoundError, handleApiError } from '@/lib/api/errors';
import { assertBillingWriteAllowed } from '@/lib/billing/write-gate';
import { getValidInternalSecrets, timingSafeIncludes } from '@/lib/server/auth-utils';
import type { PlaybookTrigger } from '@/types';

export async function POST(request: Request) {
  try {
    const secret = request.headers.get('x-internal-secret') ?? '';
    if (!timingSafeIncludes(getValidInternalSecrets(), secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJsonBody(request);
    const { organizationId, threadId, trigger } = body as {
      organizationId?: unknown;
      threadId?: unknown;
      trigger?: Partial<PlaybookTrigger>;
    };

    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new BadRequestError('Missing required fields');
    }
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new BadRequestError('Missing required fields');
    }
    if (!trigger || typeof trigger !== 'object' || typeof trigger.type !== 'string' || !trigger.type.trim()) {
      throw new BadRequestError('Missing required fields');
    }

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
    runPlaybooks(organizationId, trigger as PlaybookTrigger, threadId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Playbooks trigger POST', 'Failed to trigger playbooks');
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError('Missing required fields');
  }
}
