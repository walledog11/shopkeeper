import crypto from 'crypto';

/**
 * Timing-safe check for whether `input` matches any string in `candidates`.
 * Prevents timing-oracle attacks on secret comparison.
 * Buffers of different lengths are handled safely (returns false, no throw).
 */
export function timingSafeIncludes(candidates: string[], input: string): boolean {
  return candidates.some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(input, 'utf8'));
    } catch {
      return false;
    }
  });
}

/**
 * Resolve the set of valid internal API secrets from env vars.
 * Supports zero-downtime rotation via INTERNAL_API_SECRET_PREV.
 */
export function getValidInternalSecrets(): string[] {
  return [process.env.INTERNAL_API_SECRET, process.env.INTERNAL_API_SECRET_PREV]
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}
