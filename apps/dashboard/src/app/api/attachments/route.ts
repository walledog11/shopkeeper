import { get } from '@vercel/blob';
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

function normalizeAttachmentContentType(value: string | null | undefined): string {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mediaType)
    ? mediaType
    : 'application/octet-stream';
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
