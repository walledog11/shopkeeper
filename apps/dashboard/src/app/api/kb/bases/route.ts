import { NextResponse } from 'next/server';
import { db, getOrCreateNotesKnowledgeBase } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateKnowledgeBaseBody } from '@/app/api/kb/_lib/validation';

export const POST = withOrgRoute(
  { context: 'KB bases POST', errorMessage: 'Failed to create knowledge base', requireBillingWriteAllowed: true },
  async ({ org, request }) => {
    const { name } = parseCreateKnowledgeBaseBody(await readRequiredJsonObject(request));
    const kb = name.toLowerCase() === 'notes'
      ? await getOrCreateNotesKnowledgeBase(org.id).then(notes => (
        db.knowledgeBase.findUniqueOrThrow({
          where: { id: notes.id },
          include: { articles: true },
        })
      ))
      : await db.knowledgeBase.create({
        data: { organizationId: org.id, name, source: 'user' },
        include: { articles: true },
      });
    return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
  },
);
