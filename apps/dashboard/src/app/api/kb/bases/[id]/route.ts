import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
    const deleted = await db.knowledgeBase.deleteMany({ where: { id, organizationId: org.id } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'KB bases DELETE', 'Failed to delete knowledge base');
  }
}
