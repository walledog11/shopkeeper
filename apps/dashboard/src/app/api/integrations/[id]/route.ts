import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { stopGmailWatchIfUnused } from '@/app/api/integrations/_lib/gmail-watch';
import { unsubscribeInstagramBeforeDisconnect } from '@/app/api/integrations/_lib/instagram-disconnect';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError } from '@/lib/api/errors';

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PATCH = withOrgRoute<{ id: string }>(
  {
    context: 'Integrations PATCH',
    errorMessage: 'Failed to update integration',
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
  { context: 'Integrations DELETE', errorMessage: 'Failed to delete integration' },
  async ({ org, params }) => {
    const { id } = params;

    const integration = await db.integration.findUnique({
      where: { id },
    });
    assertEntityInOrg(integration, org.id, 'Integration not found');

    await stopGmailWatchIfUnused(integration);
    await unsubscribeInstagramBeforeDisconnect(integration);
    await db.$transaction(async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { defaultEmailIntegrationId: true },
      });
      const remainingEmail = integration.platform === 'email'
        ? await tx.integration.findFirst({
            where: {
              organizationId: org.id,
              platform: 'email',
              id: { not: integration.id },
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })
        : null;

      await tx.integration.delete({ where: { id } });
      if (organization.defaultEmailIntegrationId === integration.id) {
        await tx.organization.update({
          where: { id: org.id },
          data: { defaultEmailIntegrationId: remainingEmail?.id ?? null },
        });
      }
    });

    return new NextResponse(null, { status: 204 });
  },
);
