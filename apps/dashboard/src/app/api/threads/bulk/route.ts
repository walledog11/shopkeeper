import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const PATCH = withOrgRoute(
  { context: 'Threads Bulk PATCH', errorMessage: 'Failed to bulk update threads' },
  async ({ org, request }) => {
    const { ids, action, tag } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError('Missing ids');
    }
    if (ids.length > 100) {
      throw new BadRequestError('Too many ids — max 100 per request');
    }
    if (!['close', 'open', 'tag', 'archive'].includes(action)) {
      throw new BadRequestError('Invalid action');
    }

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
    if (action === 'tag' && tag !== undefined) data.tag = tag || null;
    if (action === 'archive') data.archivedAt = new Date();

    await db.thread.updateMany({
      where: { id: { in: verifiedIds }, organizationId: org.id },
      data,
    });

    return NextResponse.json({ updated: verifiedIds.length });
  },
);
