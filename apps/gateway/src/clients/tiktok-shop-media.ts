import logger from '../logger.js';

const TIKTOK_MEDIA_TIMEOUT_MS = 10_000;
const MAX_TIKTOK_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const TIKTOK_MEDIA_HOST_SUFFIXES = [
  'byteimg.com',
  'ibyteimg.com',
  'muscdn.com',
  'tiktok.com',
  'tiktokcdn.com',
  'tiktokshop.com',
  'ttwstatic.com',
] as const;

const IMAGE_CONTENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface DownloadedTikTokShopImage {
  filename: string;
  contentType: string;
  base64Content: string;
}

export function isAllowedTikTokShopMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const hostname = url.hostname.toLowerCase();
    return TIKTOK_MEDIA_HOST_SUFFIXES.some(
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
    if (byteLength > MAX_TIKTOK_MEDIA_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  if (byteLength === 0) return null;
  return Buffer.concat(chunks, byteLength);
}

export async function downloadTikTokShopImage(
  url: string,
): Promise<DownloadedTikTokShopImage | null> {
  if (!isAllowedTikTokShopMediaUrl(url)) return null;

  let currentUrl = url;
  const signal = AbortSignal.timeout(TIKTOK_MEDIA_TIMEOUT_MS);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!isAllowedTikTokShopMediaUrl(currentUrl)) return null;
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
          { hostname: new URL(currentUrl).hostname, status: response.status },
          '[TikTokShop] Media download failed',
        );
        return null;
      }

      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!contentType || !IMAGE_CONTENT_TYPES.has(contentType)) {
        logger.warn(
          { contentType, hostname: new URL(currentUrl).hostname },
          '[TikTokShop] Media download returned an unsupported content type',
        );
        return null;
      }

      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_TIKTOK_MEDIA_BYTES) {
        logger.warn(
          { byteLength: declaredLength, hostname: new URL(currentUrl).hostname },
          '[TikTokShop] Media download exceeded the size limit',
        );
        return null;
      }

      const body = await readBodyWithinLimit(response);
      if (!body) return null;
      const extension = CONTENT_TYPE_EXTENSIONS[contentType] ?? 'img';
      return {
        filename: `tiktok-image.${extension}`,
        contentType,
        base64Content: body.toString('base64'),
      };
    }
  } catch (error) {
    logger.warn({ err: error }, '[TikTokShop] Media download failed');
  }

  return null;
}
