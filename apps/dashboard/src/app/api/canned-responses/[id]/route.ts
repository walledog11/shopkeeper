import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

function normalizeOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array`);
  }
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses PATCH', errorMessage: 'Failed to update canned response' },
  async ({ org, request, params }) => {
    const { id } = params;
    const [{ title, body, tags, channels }, existing] = await Promise.all([
      request.json(),
      db.cannedResponse.findUnique({ where: { id } }),
    ]);
    assertEntityInOrg(existing, org.id);

    const updated = await db.cannedResponse.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: normalizeOptionalString(title, 'title') }),
        ...(body !== undefined && { body: normalizeOptionalString(body, 'body') }),
        ...(tags !== undefined && { tags: normalizeOptionalStringArray(tags, 'tags') }),
        ...(channels !== undefined && { channels: normalizeOptionalStringArray(channels, 'channels') }),
      },
    });
    return NextResponse.json({ response: updated });
  },
);

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses DELETE', errorMessage: 'Failed to delete canned response' },
  async ({ org, params }) => {
    const { id } = params;

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    assertEntityInOrg(existing, org.id);

    await db.cannedResponse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
);
