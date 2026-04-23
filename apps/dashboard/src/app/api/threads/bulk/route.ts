import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { ids, action, tag } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Too many ids — max 100 per request' }, { status: 400 });
    }
    if (!['close', 'open', 'tag', 'archive'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Verify all threads belong to this org
    const threads = await db.thread.findMany({
      where: { id: { in: ids }, organizationId: org.id, archivedAt: null },
      select: { id: true },
    });

    if (threads.length === 0) {
      return NextResponse.json({ error: 'No threads found' }, { status: 404 });
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
  } catch (error) {
    return handleApiError(error, 'Threads Bulk PATCH', 'Failed to bulk update threads');
  }
}
