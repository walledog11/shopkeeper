import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { ForbiddenError, handleApiError, NotFoundError } from '@/lib/api/errors';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
    const existing = await db.knowledgeBase.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true, source: true },
    });
    if (!existing) throw new NotFoundError();
    if (existing.source !== 'user') {
      throw new ForbiddenError('Synced knowledge bases are read-only');
    }
    await db.knowledgeBase.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'KB bases DELETE', 'Failed to delete knowledge base');
  }
}
