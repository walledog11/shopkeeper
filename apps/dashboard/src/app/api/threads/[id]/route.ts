import { NextResponse } from 'next/server';
import { db, Prisma, ThreadFilterStatus, ThreadFilterFeedback } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { THREAD_STATUS } from '@/lib/messaging/thread-constants';
import { runPlaybooks } from '@/app/api/threads/_lib/playbook-runner';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const org = await getOrCreateOrg();
    const { id } = await params;
    const body = await request.json();
    const { status, tag, shopifyCustomerId, filterStatus, filterFeedback } = body;

    if (!status && tag === undefined && shopifyCustomerId === undefined && filterStatus === undefined && filterFeedback === undefined) {
      return NextResponse.json({ error: 'Missing status, tag, shopifyCustomerId, filterStatus, or filterFeedback' }, { status: 400 });
    }

    if (status && !Object.values(THREAD_STATUS).includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (filterStatus !== undefined && !(filterStatus in ThreadFilterStatus)) {
      return NextResponse.json({ error: 'Invalid filterStatus' }, { status: 400 });
    }

    if (filterFeedback !== undefined && !(filterFeedback in ThreadFilterFeedback)) {
      return NextResponse.json({ error: 'Invalid filterFeedback' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id },
      select: { organizationId: true, filterStatus: true },
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Closing a questionable thread implies the merchant treated it as legit.
    const resolvedFeedback = filterFeedback
      ?? (status === THREAD_STATUS.CLOSED && thread.filterStatus === ThreadFilterStatus.questionable
            ? ThreadFilterFeedback.confirmed_genuine
            : undefined);

    const updated = await db.thread.update({
      where: { id },
      data: {
        ...(status && { status, cachedPlan: Prisma.DbNull, cachedPlanMessageId: null }),
        ...(tag !== undefined && { tag: tag || null }),
        ...(shopifyCustomerId !== undefined && { shopifyCustomerId: shopifyCustomerId || null }),
        ...(filterStatus !== undefined && { filterStatus }),
        ...(resolvedFeedback !== undefined && { filterFeedback: resolvedFeedback }),
      },
    });

    // Fire playbooks in background (never await — don't block the response)
    if (tag !== undefined && tag) {
      runPlaybooks(org.id, { type: 'tag_applied', tag }, id);
    } else if (status === THREAD_STATUS.CLOSED) {
      runPlaybooks(org.id, { type: 'ticket_closed' }, id);
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Threads PATCH', 'Failed to update thread');
  }
}
