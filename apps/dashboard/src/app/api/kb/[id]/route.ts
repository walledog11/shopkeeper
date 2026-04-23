import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
    const { title, body, tags } = await request.json();

    const existing = await db.kbArticle.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== org.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await db.kbArticle.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(body !== undefined && { body: body.trim() }),
        ...(tags !== undefined && { tags: tags.map((t: string) => t.trim()).filter(Boolean) }),
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
    const deleted = await db.kbArticle.deleteMany({ where: { id, organizationId: org.id } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'KB DELETE', 'Failed to delete article');
  }
}
