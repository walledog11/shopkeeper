import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const org = await getOrCreateOrg();
    const { id } = await params;
    const body = await request.json();
    const { status, tag } = body;

    if (!status && tag === undefined) {
      return NextResponse.json({ error: 'Missing status or tag' }, { status: 400 });
    }

    const thread = await db.thread.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!thread || thread.organizationId !== org.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const updated = await db.thread.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(tag !== undefined && { tag: tag || null }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Threads PATCH', 'Failed to update thread');
  }
}
