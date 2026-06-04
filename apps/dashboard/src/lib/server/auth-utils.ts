import { timingSafeIncludes } from '@/lib/security/timing-safe';

const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/**
 * Resolve the set of valid internal API secrets from env vars.
 * Supports zero-downtime rotation via INTERNAL_API_SECRET_PREV.
 */
function getValidInternalSecrets(): string[] {
  return [process.env.INTERNAL_API_SECRET, process.env.INTERNAL_API_SECRET_PREV]
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function isValidInternalSecret(secret: string | null | undefined): boolean {
  return !!secret && timingSafeIncludes(getValidInternalSecrets(), secret);
}

export function hasValidInternalSecret(request: Request): boolean {
  return isValidInternalSecret(request.headers.get(INTERNAL_SECRET_HEADER));
}
