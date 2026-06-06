import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseBulkThreadPatchBody } from '@/app/api/threads/_lib/validation';
import { enqueueCustomerMemoryForClosedThreads } from '@/lib/server/customer-memory';

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
    if (action === 'close') data.status = 'closed';
    if (action === 'open') data.status = 'open';
    if (action === 'tag') data.tag = tag;
    if (action === 'archive') data.archivedAt = new Date();

    await db.thread.updateMany({
      where: { id: { in: verifiedIds }, organizationId: org.id },
      data,
    });

    if (action === 'close') {
      const closedAt = new Date();
      await enqueueCustomerMemoryForClosedThreads({
        organizationId: org.id,
        threads: verifiedIds.map((threadId) => ({ threadId, closedAt })),
      });
    }

    return NextResponse.json({ updated: verifiedIds.length });
  },
);
