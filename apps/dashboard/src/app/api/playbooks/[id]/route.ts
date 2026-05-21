import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Playbooks PATCH', errorMessage: 'Failed to update playbook' },
  async ({ org, request, params }) => {
    const { id } = params;
    const { name, enabled, trigger, actions } = await request.json();

    const existing = await db.playbook.findUnique({ where: { id }, select: { organizationId: true } });
    assertEntityInOrg(existing, org.id, 'Playbook not found');

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
  },
);

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'Playbooks DELETE', errorMessage: 'Failed to delete playbook' },
  async ({ org, params }) => {
    const { id } = params;

    const existing = await db.playbook.findUnique({ where: { id }, select: { organizationId: true } });
    assertEntityInOrg(existing, org.id, 'Playbook not found');

    await db.playbook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
