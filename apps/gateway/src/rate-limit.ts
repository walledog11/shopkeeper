import type { Redis as IORedis } from 'ioredis';
import type { Response } from 'express';
import { getFixedWindowPeriod, incrementFixedWindowCounter } from './fixed-window-counter.js';

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
export async function rateLimit(
  redis: IORedis,
  key: string,
  limit = 60,
  windowSecs = 60,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const { windowStart, resetAt } = getFixedWindowPeriod(windowSecs);
  const windowKey = `rl:${key}:${windowStart}`;

  try {
    const count = await incrementFixedWindowCounter(redis, windowKey, windowSecs);
    return { success: count <= limit, remaining: Math.max(0, limit - count), reset: resetAt };
  } catch {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, remaining: 0, reset: resetAt };
    }
    return { success: true, remaining: limit, reset: resetAt };
  }
}

/** Sends a 429 response with standard rate-limit headers */
export function sendTooManyRequests(res: Response, reset: number): void {
  const retryAfter = Math.max(0, reset - Math.floor(Date.now() / 1000));
  res
    .status(429)
    .set({ 'Retry-After': String(retryAfter), 'X-RateLimit-Reset': String(reset) })
    .json({ error: 'Too many requests. Please try again later.' });
}
