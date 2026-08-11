import { NextResponse } from 'next/server';
import { beginIntegrationDisconnect, db } from '@shopkeeper/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';
import { enqueueIntegrationDisconnect } from '@/lib/integrations/enqueue-integration-disconnect';

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PATCH = withOrgRoute<{ id: string }>(
  {
    context: 'Integrations PATCH',
    errorMessage: 'Failed to update integration',
    requireAdmin: true,
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:update', limit: 30, windowSecs: 60 },
  },
  async ({ org, params, request }) => {
    const integration = await db.integration.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        organizationId: true,
        platform: true,
      },
    });
    assertEntityInOrg(integration, org.id, 'Integration not found');
    if (integration.platform !== 'email') {
      throw new BadRequestError('Only email integrations have a support address');
    }

    const body = await readRequiredJsonObject(request);
    const fromEmail = typeof body.fromEmail === 'string'
      ? body.fromEmail.trim().toLowerCase()
      : '';
    if (
      !fromEmail
      || fromEmail.length > 255
      || !EMAIL_ADDRESS_PATTERN.test(fromEmail)
    ) {
      throw new BadRequestError('Enter a valid support email address');
    }

    const updated = await db.integration.update({
      where: { id: integration.id },
      data: { fromEmail },
      select: {
        id: true,
        organizationId: true,
        platform: true,
        externalAccountId: true,
        fromEmail: true,
        tokenExpiresAt: true,
        metadata: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  },
);

export const DELETE = withOrgRoute<{ id: string }>(
  {
    context: 'Integrations DELETE',
    errorMessage: 'Failed to delete integration',
    requireAdmin: true,
  },
  async ({ org, params }) => {
    const started = await beginIntegrationDisconnect({
      integrationId: params.id,
      organizationId: org.id,
    });
    if (!started) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const queueAdmission = started.operation.status === 'completed'
      ? 'not_needed'
      : await enqueueIntegrationDisconnect({
          operationId: started.operation.id,
          organizationId: started.operation.organizationId,
        });

    return NextResponse.json({
      operationId: started.operation.id,
      status: started.operation.status,
      queueAdmission,
      deduplicated: started.deduplicated,
    }, { status: 202 });
  },
);
