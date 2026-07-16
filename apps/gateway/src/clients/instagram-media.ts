import logger from '../logger.js';
import type { InstagramInboundAttachment } from '../types.js';

const INSTAGRAM_MEDIA_TIMEOUT_MS = 10_000;
const MAX_INSTAGRAM_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const META_MEDIA_HOST_SUFFIXES = [
  'cdninstagram.com',
  'facebook.com',
  'facebook.net',
  'fbcdn.net',
  'fbsbx.com',
  'instagram.com',
] as const;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const ALLOWED_CONTENT_TYPES_BY_ATTACHMENT: Record<string, ReadonlySet<string>> = {
  audio: new Set(Object.keys(CONTENT_TYPE_EXTENSIONS).filter((type) => type.startsWith('audio/'))),
  file: new Set(Object.keys(CONTENT_TYPE_EXTENSIONS)),
  image: new Set(Object.keys(CONTENT_TYPE_EXTENSIONS).filter((type) => type.startsWith('image/'))),
  media: new Set(Object.keys(CONTENT_TYPE_EXTENSIONS)),
  video: new Set(Object.keys(CONTENT_TYPE_EXTENSIONS).filter((type) => type.startsWith('video/'))),
};

export interface DownloadedInstagramAttachment {
  filename: string;
  contentType: string;
  base64Content: string;
}

export function isSupportedInstagramBinaryAttachment(type: string): boolean {
  return Object.hasOwn(ALLOWED_CONTENT_TYPES_BY_ATTACHMENT, type.toLowerCase());
}

export function isAllowedInstagramMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const hostname = url.hostname.toLowerCase();
    return META_MEDIA_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function normalizeContentType(value: string | null): string | null {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function isRedirect(status: number): boolean {
  return status === 301
    || status === 302
    || status === 303
    || status === 307
    || status === 308;
}

async function readBodyWithinLimit(response: Response): Promise<Buffer | null> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_INSTAGRAM_MEDIA_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  if (byteLength === 0) return null;
  return Buffer.concat(chunks, byteLength);
}

export async function downloadInstagramAttachment(
  attachment: InstagramInboundAttachment,
): Promise<DownloadedInstagramAttachment | null> {
  const attachmentType = attachment.type.toLowerCase();
  const allowedContentTypes = ALLOWED_CONTENT_TYPES_BY_ATTACHMENT[attachmentType];
  if (!allowedContentTypes || !attachment.url || !isAllowedInstagramMediaUrl(attachment.url)) {
    return null;
  }

  let currentUrl = attachment.url;
  const signal = AbortSignal.timeout(INSTAGRAM_MEDIA_TIMEOUT_MS);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!isAllowedInstagramMediaUrl(currentUrl)) return null;
      const response = await fetch(currentUrl, {
        cache: 'no-store',
        redirect: 'manual',
        signal,
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirectCount === MAX_REDIRECTS) return null;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        logger.warn(
          { attachmentType, hostname: new URL(currentUrl).hostname, status: response.status },
          '[Instagram] Media download failed',
        );
        return null;
      }

      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!contentType || !allowedContentTypes.has(contentType)) {
        logger.warn(
          { attachmentType, contentType, hostname: new URL(currentUrl).hostname },
          '[Instagram] Media download returned an unsupported content type',
        );
        return null;
      }

      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_INSTAGRAM_MEDIA_BYTES) {
        logger.warn(
          { attachmentType, byteLength: declaredLength, hostname: new URL(currentUrl).hostname },
          '[Instagram] Media download exceeded the size limit',
        );
        return null;
      }

      const body = await readBodyWithinLimit(response);
      if (!body) return null;
      const extension = CONTENT_TYPE_EXTENSIONS[contentType];
      return {
        filename: `instagram-${attachmentType}.${extension}`,
        contentType,
        base64Content: body.toString('base64'),
      };
    }
  } catch (error) {
    logger.warn(
      { attachmentType, err: error },
      '[Instagram] Media download failed',
    );
  }

  return null;
}
