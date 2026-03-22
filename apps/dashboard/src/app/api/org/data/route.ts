import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

// DELETE /api/org/data?action=clear_tickets
export async function DELETE(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'clear_tickets') {
      // Cascade deletes messages via the Thread → Message relation
      await db.thread.deleteMany({ where: { organizationId: org.id } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, 'Org Data DELETE', 'Failed to perform action');
  }
}
