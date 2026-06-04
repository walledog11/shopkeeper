import crypto from 'node:crypto';

/**
 * Timing-safe check for whether `input` matches any string in `candidates`.
 * Buffers of different lengths are handled safely by returning false.
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
