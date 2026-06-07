import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateKnowledgeBaseBody } from '@/app/api/kb/_lib/validation';

export const POST = withOrgRoute(
  { context: 'KB bases POST', errorMessage: 'Failed to create knowledge base' },
  async ({ org, request }) => {
    const { name } = parseCreateKnowledgeBaseBody(await readRequiredJsonObject(request));
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org.id, name, source: 'user' },
      include: { articles: true },
    });
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  },
);
