/**
 * Fixed-window rate limiter backed by Redis INCR.
 *
 * Fails **closed** in production if Redis is unavailable — prevents rate-limit bypass.
 * Fails **open** in development so a missing Redis instance doesn't block local work.
 *
 * @param redis      ioredis client
 * @param key        Unique key scoped to the caller and action, e.g. `webhook:${orgId}`
 * @param limit      Max requests allowed per window (default: 60)
 * @param windowSecs Window duration in seconds (default: 60)
 */
export async function rateLimit(redis, key, limit = 60, windowSecs = 60) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / windowSecs);
    const windowKey = `rl:${key}:${windowStart}`;
    const reset = (windowStart + 1) * windowSecs;
    try {
        const count = await redis.incr(windowKey);
        if (count === 1) {
            await redis.expire(windowKey, windowSecs);
        }
        return { success: count <= limit, remaining: Math.max(0, limit - count), reset };
    }
    catch {
        if (process.env.NODE_ENV === 'production') {
            return { success: false, remaining: 0, reset };
        }
        return { success: true, remaining: limit, reset };
    }
}
/** Sends a 429 response with standard rate-limit headers */
export function sendTooManyRequests(res, reset) {
    const retryAfter = Math.max(0, reset - Math.floor(Date.now() / 1000));
    res
        .status(429)
        .set({ 'Retry-After': String(retryAfter), 'X-RateLimit-Reset': String(reset) })
        .json({ error: 'Too many requests. Please try again later.' });
}
