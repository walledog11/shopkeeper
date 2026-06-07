import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'KB bases DELETE', errorMessage: 'Failed to delete knowledge base' },
  async ({ org, params }) => {
    const { id } = params;
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
  },
);
