import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

/**
 * Fixed-window rate limiter backed by Redis INCR.
 *
 * Fails **closed** in production if Redis is unavailable — prevents rate-limit bypass.
 * Fails **open** in development so a missing Redis instance doesn't block local work.
 *
 * @param key        Unique key scoped to the caller and action, e.g. `ai-draft:${orgId}`
 * @param limit      Max requests allowed per window (default: 10)
 * @param windowSecs Window duration in seconds (default: 60)
 */
export async function rateLimit(
  key: string,
  limit = 10,
  windowSecs = 60,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSecs);
  const windowKey = `rl:${key}:${windowStart}`;
  const reset = (windowStart + 1) * windowSecs;

  try {
    const client = getRedis();
    const count = await client.incr(windowKey);
    if (count === 1) {
      // Set expiry only on first increment so the key is cleaned up automatically
      await client.expire(windowKey, windowSecs);
    }
    return { success: count <= limit, remaining: Math.max(0, limit - count), reset };
  } catch {
    // Redis unavailable — fail closed in production to prevent rate-limit bypass
    if (process.env.NODE_ENV !== 'development') {
      return { success: false, remaining: 0, reset };
    }
    return { success: true, remaining: limit, reset };
  }
}

/** Returns a 429 response with standard rate-limit headers */
export function tooManyRequests(reset: number): NextResponse {
  const retryAfter = Math.max(0, reset - Math.floor(Date.now() / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(reset),
      },
    }
  );
}
