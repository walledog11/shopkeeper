import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((tag) => {
    if (typeof tag !== 'string') return [];
    const trimmed = tag.trim();
    return trimmed ? [trimmed] : [];
  });
}

export const POST = withOrgRoute<{ id: string }>(
  { context: 'KB article POST', errorMessage: 'Failed to create article' },
  async ({ org, request, params }) => {
    const { id: knowledgeBaseId } = params;

    const kb = await db.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, organizationId: org.id },
      select: { id: true, source: true },
    });
    if (!kb) throw new NotFoundError();
    if (kb.source !== 'user') {
      throw new ForbiddenError('Synced knowledge bases are read-only');
    }

    const { title, body, tags } = await request.json() as {
      title?: unknown;
      body?: unknown;
      tags?: unknown;
    };
    if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
      throw new BadRequestError('title and body are required');
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      throw new BadRequestError('tags must be an array');
    }

    const article = await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId,
        title: title.trim(),
        body: body.trim(),
        tags: normalizeTags(tags),
      },
    });
    return NextResponse.json({ article }, { status: 201 });
  },
);
