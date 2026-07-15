import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const PATCH = withOrgRoute(
  {
    context: 'Default email integration PATCH',
    errorMessage: 'Failed to set default email integration',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:email-default', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request);
    const integrationId = typeof body.integrationId === 'string'
      ? body.integrationId.trim()
      : '';
    if (!integrationId) {
      throw new BadRequestError('Missing integrationId');
    }

    const integration = await db.integration.findFirst({
      where: {
        id: integrationId,
        organizationId: org.id,
        platform: 'email',
      },
      select: { id: true },
    });
    if (!integration) {
      throw new BadRequestError('Choose an email integration owned by this workspace');
    }

    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: integration.id },
    });

    return NextResponse.json({ integrationId: integration.id });
  },
);
