import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: knowledgeBaseId } = await params;
    const org = await getOrCreateOrg();

    const kb = await db.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, organizationId: org.id },
      select: { id: true },
    });
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { title, body, tags } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    const article = await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId,
        title: title.trim(),
        body: body.trim(),
        tags: Array.isArray(tags) ? tags.map((t: string) => t.trim()).filter(Boolean) : [],
      },
    });
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'KB article POST', 'Failed to create article');
  }
}
