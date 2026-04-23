import { normalizeAbsoluteUrl, readEnv } from "@/lib/env/helpers";

export function getGatewayBaseUrl(options: { required?: boolean } = {}): string | null {
  const canonicalUrl = readEnv('GATEWAY_INTERNAL_URL');
  const legacyUrl = readEnv('GATEWAY_PUBLIC_URL');

  const normalizedCanonical = canonicalUrl
    ? normalizeAbsoluteUrl('GATEWAY_INTERNAL_URL', canonicalUrl)
    : null;
  const normalizedLegacy = legacyUrl
    ? normalizeAbsoluteUrl('GATEWAY_PUBLIC_URL', legacyUrl)
    : null;

  if (
    normalizedCanonical &&
    normalizedLegacy &&
    normalizedCanonical !== normalizedLegacy
  ) {
    throw new Error(
      '[Dashboard] GATEWAY_INTERNAL_URL and GATEWAY_PUBLIC_URL must match when both are set'
    );
  }

  const resolved = normalizedCanonical ?? normalizedLegacy;
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
