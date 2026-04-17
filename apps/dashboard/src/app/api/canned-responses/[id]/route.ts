import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();
    const { title, body, tags, channels } = await request.json();

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== org.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await db.cannedResponse.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(body !== undefined && { body: body.trim() }),
        ...(tags !== undefined && { tags: tags.map((t: string) => t.trim()).filter(Boolean) }),
        ...(channels !== undefined && { channels: channels.map((c: string) => c.trim()).filter(Boolean) }),
      },
    });
    return NextResponse.json({ response: updated });
  } catch (error) {
    return handleApiError(error, 'Canned Responses PATCH', 'Failed to update canned response');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== org.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Canned Responses DELETE', 'Failed to delete canned response');
  }
}
