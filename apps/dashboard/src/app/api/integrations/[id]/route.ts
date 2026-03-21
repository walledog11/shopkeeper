import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const org = await getOrCreateOrg();
    const { id } = await params;

    const integration = await db.integration.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!integration || integration.organizationId !== org.id) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    await db.integration.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Integrations DELETE', 'Failed to delete integration');
  }
}
