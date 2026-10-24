import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { isRecord } from '@shopkeeper/shared/guards';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { readRequiredJsonObject } from '@/lib/api/body';
import { readChatConfiguration, validateChatSettings } from '@/lib/storefront-chat/configuration';
import { readStorefrontChatEnabled } from '@/lib/storefront-chat/metadata';
import { parseChatImageUrl } from '@/lib/storefront-chat/images';

async function connectedShop(organizationId: string) {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { id: true, externalAccountId: true, fromEmail: true, metadata: true },
  });
  if (!integration) throw new NotFoundError('Connect Shopify to configure storefront chat.');
  return integration;
}

export const GET = withOrgRoute(
  { context: 'Chat configuration GET', errorMessage: 'Could not load chat settings.' },
  async ({ org }) => {
    const integration = await connectedShop(org.id);
    return NextResponse.json({
      shop: integration.externalAccountId, shopName: integration.fromEmail || org.name,
      enabled: readStorefrontChatEnabled(integration.metadata),
      configuration: readChatConfiguration(integration.metadata),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  },
);

export const PUT = withOrgRoute(
  {
    context: 'Chat configuration PUT', errorMessage: 'Could not publish chat settings.',
    requireAdmin: true, requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:publish', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request);
    const result = validateChatSettings(body.settings);
    if (!result.settings) throw new BadRequestError(result.error);
    const picture = parseChatImageUrl(result.settings.logoUrl);
    if (picture && picture.organizationId !== org.id) throw new BadRequestError('Upload a picture for this workspace.');
    if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) {
      throw new BadRequestError('A settings revision is required. Reload and try again.');
    }
    const integration = await connectedShop(org.id);
    const previous = readChatConfiguration(integration.metadata);
    if ((previous?.revision ?? 0) !== body.revision) {
      throw new ConflictError('Chat settings changed in another tab. Reload the published settings before trying again.');
    }
    const configuration = {
      schemaVersion: 1 as const, revision: (previous?.revision ?? 0) + 1,
      publishedAt: new Date().toISOString(), settings: { ...result.settings },
    };
    const metadata = isRecord(integration.metadata) ? integration.metadata : {};
    const chat = isRecord(metadata.storefrontChat) ? metadata.storefrontChat : {};
    // Compare the entire JSON value so concurrent enable/disable and OAuth
    // updates cannot be overwritten by a stale read of integration metadata.
    const saved = await db.integration.updateMany({
      where: { id: integration.id, organizationId: org.id, lifecycleStatus: 'active',
        metadata: { equals: integration.metadata ?? Prisma.DbNull } },
      data: { metadata: { ...metadata, storefrontChat: { ...chat, configuration } } as Prisma.InputJsonObject },
    });
    if (!saved.count) throw new ConflictError('Shop settings changed. Reload the published settings and try again.');
    return NextResponse.json({ configuration });
  },
);
