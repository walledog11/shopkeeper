import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses PATCH', errorMessage: 'Failed to update canned response' },
  async ({ org, request, params }) => {
    const { id } = params;
    const { title, body, tags, channels } = await request.json();

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    assertEntityInOrg(existing, org.id);

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
  },
);

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses DELETE', errorMessage: 'Failed to delete canned response' },
  async ({ org, params }) => {
    const { id } = params;

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    assertEntityInOrg(existing, org.id);

    await db.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
