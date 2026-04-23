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

    await db.cannedResponse.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Canned Responses USE', 'Failed to track usage');
  }
}
