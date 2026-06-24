import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateKbArticleBody } from '@/app/api/kb/_lib/validation';

export const POST = withOrgRoute<{ id: string }>(
  { context: 'KB article POST', errorMessage: 'Failed to create article', requireBillingWriteAllowed: true },
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

    const { title, body, tags } = parseCreateKbArticleBody(await readRequiredJsonObject(request));

    const article = await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId,
        title,
        body,
        tags,
      },
    });
    return NextResponse.json({ article }, { status: 201 });
  },
);
