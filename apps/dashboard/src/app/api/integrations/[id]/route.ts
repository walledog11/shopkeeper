import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { stopGmailWatchIfUnused } from '@/app/api/integrations/_lib/gmail-watch';

export const DELETE = withOrgRoute<{ id: string }>(
  { context: 'Integrations DELETE', errorMessage: 'Failed to delete integration' },
  async ({ org, params }) => {
    const { id } = params;

    const integration = await db.integration.findUnique({
      where: { id },
    });
    assertEntityInOrg(integration, org.id, 'Integration not found');

    await stopGmailWatchIfUnused(integration);
    await db.integration.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  },
);
