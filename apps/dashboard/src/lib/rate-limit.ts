// Simple in-memory rate limiter.
// Keys are arbitrary strings (e.g. "ai-draft:<orgId>").
// Not suitable for multi-instance deployments — use Redis for that.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Returns true if the request is allowed, false if it should be rate-limited.
 * @param key       Unique identifier for the caller (e.g. "ai-draft:<orgId>")
 * @param limit     Max requests per window (default: 10)
 * @param windowMs  Window length in milliseconds (default: 60s)
 */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) return false

  bucket.count++
  return true
}
