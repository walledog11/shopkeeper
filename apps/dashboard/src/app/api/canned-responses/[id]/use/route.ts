import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

export const POST = withOrgRoute<{ id: string }>(
  { context: 'Canned Responses USE', errorMessage: 'Failed to track usage' },
  async ({ org, params }) => {
    const { id } = params;

    const existing = await db.cannedResponse.findUnique({ where: { id } });
    assertEntityInOrg(existing, org.id);

    await db.cannedResponse.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  },
);
