import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { BadRequestError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { readRequiredJsonObject } from '@/lib/api/body';
import {
  mergeStorefrontChatEnabled,
  readStorefrontChatEnabled,
} from '@/lib/storefront-chat/metadata';
import { isStorefrontChatGloballyEnabled } from '@/lib/storefront-chat/enabled';

export const PATCH = withOrgRoute(
  {
    context: 'Shopify storefront chat PATCH',
    errorMessage: 'Failed to update storefront chat',
    requireAdmin: true,
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:shopify-storefront-chat', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
      select: { id: true, metadata: true },
    });
    if (!integration) {
      throw new BadRequestError('No Shopify integration connected');
    }

    const body = await readRequiredJsonObject(request);
    if (typeof body.enabled !== 'boolean') {
      throw new BadRequestError('enabled must be a boolean');
    }

    if (body.enabled && !isStorefrontChatGloballyEnabled()) {
      throw new BadRequestError('Storefront chat is not available yet');
    }

    const metadata = mergeStorefrontChatEnabled(integration.metadata, body.enabled);

    await db.$transaction(async (tx) => {
      await tx.integration.update({
        where: { id: integration.id },
        data: { metadata },
      });

      if (!body.enabled) {
        await tx.storefrontChatSession.updateMany({
          where: { integrationId: integration.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    return NextResponse.json({
      enabled: readStorefrontChatEnabled(metadata),
      globallyEnabled: isStorefrontChatGloballyEnabled(),
    });
  },
);
