import { get } from '@vercel/blob';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import {
  attachmentBelongsToOrg,
  attachmentFilename,
  parseManagedAttachmentRef,
} from '@/lib/attachments/blob-ref';

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
    const headers = new Headers({
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
    });

    return new Response(result.stream, { headers });
  },
);
