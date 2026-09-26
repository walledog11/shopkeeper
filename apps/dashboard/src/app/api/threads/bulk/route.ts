import { NextResponse } from 'next/server';
import { db, Prisma } from '@shopkeeper/db';
import { stopWaitingTasksOnClosedThreads } from '@shopkeeper/agent/task-ledger';
import { NotFoundError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseBulkThreadPatchBody } from '@/app/api/threads/_lib/validation';

export const PATCH = withOrgRoute(
  { context: 'Threads Bulk PATCH', errorMessage: 'Failed to bulk update threads' },
  async ({ org, request }) => {
    const { ids, action, tag } = parseBulkThreadPatchBody(await readRequiredJsonObject(request));

    // Verify all threads belong to this org
    const threads = await db.thread.findMany({
      where: { id: { in: ids }, organizationId: org.id, archivedAt: null },
      select: { id: true },
    });

    if (threads.length === 0) {
      throw new NotFoundError('No threads found');
    }

    const verifiedIds = threads.map(t => t.id);

    const data: Record<string, unknown> = {};
    // A close drops the cached plan with the conversation, as a single close does.
    if (action === 'close') Object.assign(data, { status: 'closed', cachedPlan: Prisma.DbNull, cachedPlanMessageId: null });
    if (action === 'open') data.status = 'open';
    if (action === 'tag') data.tag = tag;
    if (action === 'archive') data.archivedAt = new Date();

    await db.$transaction(async (tx) => {
      await tx.thread.updateMany({
        where: { id: { in: verifiedIds }, organizationId: org.id },
        data,
      });
      if (action === 'close') {
        await stopWaitingTasksOnClosedThreads(tx, { organizationId: org.id, threadIds: verifiedIds });
      }
    });

    return NextResponse.json({ updated: verifiedIds.length });
  },
);
