import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreatePlaybookBody } from '@/app/api/playbooks/_lib/playbook-shape';

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
    const { name, trigger, actions } = parseCreatePlaybookBody(await readRequiredJsonObject(request));

    const playbook = await db.playbook.create({
      data: {
        organizationId: org.id,
        name,
        trigger,
        actions,
      },
    });

    return NextResponse.json({ playbook }, { status: 201 });
  },
);
