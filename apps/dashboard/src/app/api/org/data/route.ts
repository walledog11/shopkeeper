import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

// DELETE /api/org/data?action=clear_tickets
export async function DELETE(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`org:data:delete:${org.id}`, 2, 3600);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'clear_tickets') {
      await db.thread.updateMany({ where: { organizationId: org.id }, data: { archivedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, 'Org Data DELETE', 'Failed to perform action');
  }
}
