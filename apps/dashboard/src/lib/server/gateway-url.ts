import { normalizeAbsoluteUrl, readEnv } from "@/lib/env/helpers";

export function getGatewayBaseUrl(options: { required?: boolean } = {}): string | null {
  const canonicalUrl = readEnv('GATEWAY_INTERNAL_URL');

  const resolved = canonicalUrl
    ? normalizeAbsoluteUrl('GATEWAY_INTERNAL_URL', canonicalUrl)
    : null;
  if (resolved) {
    return resolved;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:8080';
  }

  if (options.required) {
    throw new Error('[Dashboard] Missing required environment variable: GATEWAY_INTERNAL_URL');
  }

  return null;
}
