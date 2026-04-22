function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAbsoluteUrl(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[Dashboard] ${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`[Dashboard] ${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
}

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
