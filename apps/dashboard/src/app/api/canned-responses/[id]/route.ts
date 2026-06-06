import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { parseUpdateCannedResponseBody } from '@/app/api/canned-responses/_lib/validation';

export const PATCH = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses PATCH', errorMessage: 'Failed to update canned response' },
  async ({ org, request, params }) => {
    const { id } = params;
    const [requestBody, existing] = await Promise.all([
      readRequiredJsonObject(request),
      db.cannedResponse.findUnique({ where: { id } }),
    ]);
    const { title, body, tags, channels } = parseUpdateCannedResponseBody(requestBody);
    assertEntityInOrg(existing, org.id);

    const updated = await db.cannedResponse.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(tags !== undefined && { tags }),
        ...(channels !== undefined && { channels }),
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
