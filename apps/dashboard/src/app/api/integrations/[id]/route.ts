import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'Integrations DELETE', errorMessage: 'Failed to delete integration' },
  async ({ org, params }) => {
    const { id } = params;

    const integration = await db.integration.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    assertEntityInOrg(integration, org.id, 'Integration not found');

    await db.integration.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  },
);
