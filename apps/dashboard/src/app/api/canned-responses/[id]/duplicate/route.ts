import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

export const POST = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses DUPLICATE', errorMessage: 'Failed to duplicate canned response' },
  async ({ org, params }) => {
    const { id } = params;

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    assertEntityInOrg(existing, org.id);

    const response = await db.cannedResponse.create({
      data: {
        organizationId: org.id,
        title: `${existing.title} (copy)`,
        body: existing.body,
        tags: existing.tags,
        channels: existing.channels,
      },
    });

    return NextResponse.json({ response }, { status: 201 });
  },
);
