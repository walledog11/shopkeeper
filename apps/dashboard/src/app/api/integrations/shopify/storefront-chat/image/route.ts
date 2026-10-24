import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { db } from '@shopkeeper/db';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { chatImagePathname, chatImageUrl, MAX_CHAT_IMAGE_BYTES } from '@/lib/storefront-chat/images';

export const POST = withOrgRoute(
  {
    context: 'Chat picture POST', errorMessage: 'Could not upload your picture. Please try again.',
    requireAdmin: true, requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:picture', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify', lifecycleStatus: 'active' },
      select: { id: true },
    });
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
    await put(chatImagePathname(org.id, imageId), image, {
      access: 'private', contentType: 'image/webp', addRandomSuffix: false,
    });
    return NextResponse.json({ url: chatImageUrl(org.id, imageId) });
  },
);
