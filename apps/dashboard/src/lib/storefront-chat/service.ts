import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { db } from '@shopkeeper/db';
import { isRecord } from '@shopkeeper/shared/guards';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { readChatConfiguration, validateChatSettings, type ChatConfigurationResponse } from './configuration';
import { isStorefrontChatGloballyEnabled } from './enabled';
import { chatImagePathname, chatImageUrl, MAX_CHAT_IMAGE_BYTES, parseChatImageUrl } from './images';
import { mergeStorefrontChatEnabled, readStorefrontChatEnabled } from './metadata';
import { getStorefrontChatReadiness } from './readiness';

// The workspace's website chat settings, written from two places: the dashboard
// (Clerk session) and the app home inside Shopify admin (Shopify session
// token). Each caller authenticates and resolves the organization first.

function findShopifyIntegration(organizationId: string) {
  return db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { id: true, externalAccountId: true, fromEmail: true, metadata: true },
  });
}

async function connectedShop(organizationId: string) {
  const integration = await findShopifyIntegration(organizationId);
  if (!integration) throw new NotFoundError('Connect Shopify to configure storefront chat.');
  return integration;
}

export function chatConfigurationFromIntegration(
  integration: { externalAccountId: string; fromEmail: string | null; metadata: unknown },
  workspaceName: string,
): ChatConfigurationResponse {
  return {
    shop: integration.externalAccountId, shopName: integration.fromEmail || workspaceName,
    enabled: readStorefrontChatEnabled(integration.metadata),
    configuration: readChatConfiguration(integration.metadata),
  };
}

export async function loadChatConfiguration(
  organizationId: string,
  workspaceName: string,
): Promise<ChatConfigurationResponse> {
  return chatConfigurationFromIntegration(await connectedShop(organizationId), workspaceName);
}

export async function publishChatConfiguration(organizationId: string, body: Record<string, unknown>) {
  const result = validateChatSettings(body.settings);
  if (!result.settings) throw new BadRequestError(result.error);
  const picture = parseChatImageUrl(result.settings.logoUrl);
  if (picture && picture.organizationId !== organizationId) throw new BadRequestError('Upload a picture for this workspace.');
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0) {
    throw new BadRequestError('A settings revision is required. Reload and try again.');
  }
  const integration = await connectedShop(organizationId);
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
    where: { id: integration.id, organizationId, lifecycleStatus: 'active',
      metadata: { equals: integration.metadata ?? Prisma.DbNull } },
    data: { metadata: { ...metadata, storefrontChat: { ...chat, configuration } } as Prisma.InputJsonObject },
  });
  if (!saved.count) throw new ConflictError('Shop settings changed. Reload the published settings and try again.');
  return { configuration };
}

export async function setStorefrontChatEnabled(organizationId: string, body: Record<string, unknown>) {
  const integration = await findShopifyIntegration(organizationId);
  if (!integration) {
    throw new BadRequestError('No Shopify integration connected');
  }

  if (typeof body.enabled !== 'boolean') {
    throw new BadRequestError('enabled must be a boolean');
  }

  if (body.enabled && !isStorefrontChatGloballyEnabled()) {
    throw new BadRequestError('Storefront chat is not available yet');
  }
  if (body.enabled && !(await getStorefrontChatReadiness(organizationId)).canEnable) {
    throw new BadRequestError('Complete the chat service setup and reconnect Shopify before enabling chat');
  }

  const metadata = mergeStorefrontChatEnabled(integration.metadata, body.enabled);

  await db.$transaction(async (tx) => {
    const saved = await tx.integration.updateMany({
      where: { id: integration.id, organizationId, lifecycleStatus: 'active',
        metadata: { equals: integration.metadata ?? Prisma.DbNull } },
      data: { metadata },
    });
    if (!saved.count) throw new ConflictError('Shop settings changed. Try again.');

    if (!body.enabled) {
      await tx.storefrontChatSession.updateMany({
        where: { integrationId: integration.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  return {
    enabled: readStorefrontChatEnabled(metadata),
    globallyEnabled: isStorefrontChatGloballyEnabled(),
  };
}

export async function uploadChatPicture(organizationId: string, request: Request) {
  const integration = await findShopifyIntegration(organizationId);
  if (!integration) throw new NotFoundError('Connect Shopify before uploading a chat picture.');
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) throw new BadRequestError('Choose a picture to upload.');
  if (file.size > MAX_CHAT_IMAGE_BYTES) throw new BadRequestError('This picture is too large. Choose a smaller picture.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new BadRequestError('Choose a JPG, PNG, or WebP picture.');
  }

  let image: Buffer;
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported image');
    // Auto-orient phone photos, preserve the whole image, and strip metadata.
    image = await source.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new BadRequestError('This picture could not be opened. Try another JPG, PNG, or WebP.');
  }
  const imageId = randomUUID();
  await put(chatImagePathname(organizationId, imageId), image, {
    access: 'private', contentType: 'image/webp', addRandomSuffix: false,
  });
  return { url: chatImageUrl(organizationId, imageId) };
}
