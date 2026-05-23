import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
}

function requireTrigger(value: unknown): object {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { type?: unknown }).type !== 'string' ||
    !(value as { type: string }).type.trim()
  ) {
    throw new BadRequestError('trigger is required');
  }
  return value;
}

function normalizeActions(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError('actions must be an array');
  }
  return value;
}

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

    const playbook = await db.playbook.create({
      data: {
        organizationId: org.id,
        name: requireNonEmptyString(name, 'name'),
        trigger: requireTrigger(trigger),
        actions: normalizeActions(actions),
      },
    });

    return NextResponse.json({ playbook }, { status: 201 });
  },
);
