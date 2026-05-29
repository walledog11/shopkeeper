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

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'KB PATCH', errorMessage: 'Failed to update article' },
  async ({ org, request, params }) => {
    const { id } = params;
    const { title, body, tags } = await request.json() as {
      title?: unknown;
      body?: unknown;
      tags?: unknown;
    };

    const existing = await db.kbArticle.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true, knowledgeBase: { select: { source: true } } },
    });
    if (!existing) throw new NotFoundError();
    if (existing.knowledgeBase.source !== 'user') {
      throw new ForbiddenError('Synced knowledge base articles are read-only');
    }
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      throw new BadRequestError('title must be a non-empty string');
    }
    if (body !== undefined && (typeof body !== 'string' || !body.trim())) {
      throw new BadRequestError('body must be a non-empty string');
    }
    if (tags !== undefined && !Array.isArray(tags)) {
      throw new BadRequestError('tags must be an array');
    }

    const updated = await db.kbArticle.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: (title as string).trim() }),
        ...(body !== undefined && { body: (body as string).trim() }),
        ...(tags !== undefined && { tags: normalizeTags(tags) }),
      },
    });
    return NextResponse.json({ article: updated });
  },
);

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'KB DELETE', errorMessage: 'Failed to delete article' },
  async ({ org, params }) => {
    const { id } = params;
    const existing = await db.kbArticle.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true, knowledgeBase: { select: { source: true } } },
    });
    if (!existing) throw new NotFoundError();
    if (existing.knowledgeBase.source !== 'user') {
      throw new ForbiddenError('Synced knowledge base articles are read-only');
    }
    await db.kbArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
