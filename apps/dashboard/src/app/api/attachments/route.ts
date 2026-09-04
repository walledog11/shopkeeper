import { randomUUID } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  attachmentPathname,
  formatAttachmentRef,
  isBlockedAttachment,
  normalizeAttachmentContentType,
  sanitizeAttachmentName,
} from '@shopkeeper/agent/attachment-ref';
import { getOutboundAttachmentLimits } from '@shopkeeper/email/attachment-load';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import {
  attachmentBelongsToOrg,
  attachmentFilename,
  parseManagedAttachmentRef,
} from '@/lib/attachments/blob-ref';

const INLINE_IMAGE_TYPES = new Map([
  ['image/gif', new Set(['gif'])],
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
]);

async function fetchManagedAttachment(pathname: string) {
  const privateResult = await get(pathname, { access: 'private' });
  if (privateResult?.statusCode === 200 && privateResult.stream) {
    return privateResult;
  }

  const publicResult = await get(pathname, { access: 'public' });
  if (publicResult?.statusCode === 200 && publicResult.stream) {
    return publicResult;
  }

  return null;
}

function attachmentDisposition(filename: string, contentType: string): 'inline' | 'attachment' {
  const extension = filename.toLowerCase().split('.').at(-1) ?? '';
  return INLINE_IMAGE_TYPES.get(contentType)?.has(extension) ? 'inline' : 'attachment';
}

export const GET = withOrgRoute(
  {
    context: 'Attachments GET',
    errorMessage: 'Failed to load attachment',
    rateLimit: { key: 'attachments:get', limit: 120, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const ref = new URL(request.url).searchParams.get('ref');
    if (!ref) {
      throw new BadRequestError('Missing ref');
    }

    const pathname = parseManagedAttachmentRef(ref);
    if (!pathname) {
      throw new BadRequestError('Unsupported attachment ref');
    }
    if (!attachmentBelongsToOrg(pathname, org.id)) {
      throw new NotFoundError('Not found');
    }

    const result = await fetchManagedAttachment(pathname);
    if (!result) {
      throw new NotFoundError('Not found');
    }

    const filename = attachmentFilename(pathname);
    const contentType = normalizeAttachmentContentType(result.blob.contentType);
    const disposition = attachmentDisposition(filename, contentType);
    const headers = new Headers({
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      // Only passive raster formats whose MIME and extension agree render
      // inline. Every other supported attachment remains available as a
      // download without becoming active same-origin browser content.
      'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
    });

    return new Response(result.stream, { headers });
  },
);

// One file per request. The merchant picks several, the composer uploads them
// individually, and a rejected file names itself instead of failing a batch
// whose other members were fine.
export const POST = withOrgRoute(
  {
    context: 'Attachments POST',
    errorMessage: 'Failed to upload attachment',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'attachments:upload', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      throw new BadRequestError('Missing file');
    }

    const safeName = sanitizeAttachmentName(file.name);
    const contentType = normalizeAttachmentContentType(file.type);
    if (isBlockedAttachment(safeName, contentType)) {
      throw new BadRequestError(`${safeName} is a file type we can't send`);
    }

    const { maxBytesEach } = getOutboundAttachmentLimits();
    if (file.size === 0) {
      throw new BadRequestError(`${safeName} is empty`);
    }
    // Only the per-file ceiling belongs here: this route sees one file and
    // cannot know what else is staged. The running total is owned by
    // `loadOutboundAttachments`, which reads the real sizes at send time.
    if (file.size > maxBytesEach) {
      throw new BadRequestError(
        `${safeName} is too large — attachments are limited to ${Math.floor(maxBytesEach / 1_048_576)}MB`,
      );
    }

    const pathname = attachmentPathname(org.id, randomUUID(), safeName);
    await put(pathname, Buffer.from(await file.arrayBuffer()), {
      access: 'private',
      contentType,
      addRandomSuffix: false,
    });

    return NextResponse.json({
      ref: formatAttachmentRef(pathname),
      name: safeName,
      contentType,
      bytes: file.size,
    });
  },
);
