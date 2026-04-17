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
    const { name, enabled, trigger, actions } = await request.json();

    const existing = await db.playbook.findUnique({ where: { id }, select: { organizationId: true } });
    if (!existing || existing.organizationId !== org.id) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 });
    }

    const updated = await db.playbook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(enabled !== undefined && { enabled }),
        ...(trigger !== undefined && { trigger }),
        ...(actions !== undefined && { actions }),
      },
    });

    return NextResponse.json({ playbook: updated });
  } catch (error) {
    return handleApiError(error, 'Playbooks PATCH', 'Failed to update playbook');
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const org = await getOrCreateOrg();
    const { id } = await params;

    const existing = await db.playbook.findUnique({ where: { id }, select: { organizationId: true } });
    if (!existing || existing.organizationId !== org.id) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 });
    }

    await db.playbook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Playbooks DELETE', 'Failed to delete playbook');
  }
}
