import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const org = await getOrCreateOrg();

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== org.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const response = await db.cannedResponse.create({
      data: {
        organizationId: org.id,
        title: `${existing.title} (copy)`,
        body: existing.body,
        tags: existing.tags,
        channels: existing.channels,
      },
    });

    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Canned Responses DUPLICATE', 'Failed to duplicate canned response');
  }
}
