import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/org';
import { handleApiError } from '@/lib/api-errors';

export async function GET() {
  try {
    const org = await getOrCreateOrg();
    const playbooks = await db.playbook.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ playbooks });
  } catch (error) {
    return handleApiError(error, 'Playbooks GET', 'Failed to fetch playbooks');
  }
}

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { name, trigger, actions } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!trigger?.type) {
      return NextResponse.json({ error: 'trigger is required' }, { status: 400 });
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
  } catch (error) {
    return handleApiError(error, 'Playbooks POST', 'Failed to create playbook');
  }
}
