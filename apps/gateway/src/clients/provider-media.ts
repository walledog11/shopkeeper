import logger from '../logger.js';

export function isAllowedProviderMediaUrl(value: string, suffixes: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (!url.port || url.port === '443')
      && suffixes.some(suffix => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch { return false; }
}

function hostOf(value: string): string | null {
  try { return new URL(value).host; } catch { return null; }
}

export async function downloadProviderMedia(url: string, policy: {
  allowedUrl: (url: string) => boolean;
  allowedContentTypes: ReadonlySet<string>;
  filename: (contentType: string) => string;
  signal?: AbortSignal;
  consumeBytes?: (bytes: number) => boolean;
}): Promise<{ filename: string; contentType: string; base64Content: string } | null> {
  const maxBytes = 10 * 1024 * 1024;
  const timeout = AbortSignal.timeout(10_000);
  const signal = policy.signal ? AbortSignal.any([policy.signal, timeout]) : timeout;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!policy.allowedUrl(url)) {
        // The host only: provider media URLs carry signed, expiring credentials.
        logger.warn({ host: hostOf(url), redirects }, '[Media] Media URL host not allowed');
        return null;
      }
      const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 3) return null;
        url = new URL(location, url).toString();
        continue;
      }
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (!response.ok || !contentType || !policy.allowedContentTypes.has(contentType)
        || Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        return null;
      }
      if (!response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes || policy.consumeBytes?.(value.byteLength) === false) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (!bytes) return null;
      return { filename: policy.filename(contentType), contentType, base64Content: Buffer.concat(chunks, bytes).toString('base64') };
    }
  } catch (err) { logger.warn({ err }, '[Media] Download failed'); }
  return null;
}
