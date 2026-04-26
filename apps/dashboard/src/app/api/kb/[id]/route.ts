import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { BadRequestError, ForbiddenError, handleApiError, NotFoundError } from '@/lib/api/errors';

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(Boolean);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
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
        ...(title !== undefined && { title: title.trim() }),
        ...(body !== undefined && { body: body.trim() }),
        ...(tags !== undefined && { tags: normalizeTags(tags) }),
      },
    });
    return NextResponse.json({ article: updated });
  } catch (error) {
    return handleApiError(error, 'KB PATCH', 'Failed to update article');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
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
  } catch (error) {
    return handleApiError(error, 'KB DELETE', 'Failed to delete article');
  }
}
