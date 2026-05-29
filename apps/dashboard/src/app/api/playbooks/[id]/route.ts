import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

function normalizeOptionalName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError('name must be a non-empty string');
  }
  return value.trim();
}

function normalizeOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new BadRequestError(`${field} must be a boolean`);
  }
  return value;
}

function normalizeOptionalTrigger(value: unknown): object | undefined {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { type?: unknown }).type !== 'string' ||
    !(value as { type: string }).type.trim()
  ) {
    throw new BadRequestError('trigger must include a type');
  }
  return value;
}

function normalizeOptionalActions(value: unknown): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new BadRequestError('actions must be an array');
  }
  return value;
}

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Playbooks PATCH', errorMessage: 'Failed to update playbook' },
  async ({ org, request, params }) => {
    const { id } = params;
    const [{ name, enabled, trigger, actions }, existing] = await Promise.all([
      request.json(),
      db.playbook.findUnique({ where: { id }, select: { organizationId: true } }),
    ]);
    assertEntityInOrg(existing, org.id, 'Playbook not found');

    const updated = await db.playbook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: normalizeOptionalName(name) }),
        ...(enabled !== undefined && { enabled: normalizeOptionalBoolean(enabled, 'enabled') }),
        ...(trigger !== undefined && { trigger: normalizeOptionalTrigger(trigger) }),
        ...(actions !== undefined && { actions: normalizeOptionalActions(actions) }),
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
