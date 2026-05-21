import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const GET = withOrgRoute(
  { context: 'Playbooks GET', errorMessage: 'Failed to fetch playbooks' },
  async ({ org }) => {
    const playbooks = await db.playbook.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ playbooks });
  },
);

export const POST = withOrgRoute(
  { context: 'Playbooks POST', errorMessage: 'Failed to create playbook' },
  async ({ org, request }) => {
    const { name, trigger, actions } = await request.json();

    if (!name?.trim()) {
      throw new BadRequestError('name is required');
    }
    if (!trigger?.type) {
      throw new BadRequestError('trigger is required');
    }

    const playbook = await db.playbook.create({
      data: {
        organizationId: org.id,
        name: name.trim(),
        trigger,
        actions: actions ?? [],
      },
    });

    return NextResponse.json({ playbook }, { status: 201 });
  },
);
