import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseUpdateKbArticleBody } from '@/app/api/kb/_lib/validation';

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'KB PATCH', errorMessage: 'Failed to update article' },
  async ({ org, request, params }) => {
    const { id } = params;
    const { title, body, tags } = parseUpdateKbArticleBody(await readRequiredJsonObject(request));

    const existing = await db.kbArticle.findFirst({
      where: { id, organizationId: org.id },
      select: { id: true, knowledgeBase: { select: { source: true } } },
    });
    if (!existing) throw new NotFoundError();
    if (existing.knowledgeBase.source !== 'user') {
      throw new ForbiddenError('Synced knowledge base articles are read-only');
    }

    const updated = await db.kbArticle.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(tags !== undefined && { tags }),
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
