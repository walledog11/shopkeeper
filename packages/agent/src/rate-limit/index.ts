/**
 * Host-injected fixed-window rate limiter seam. Both apps share the window-key
 * math and the INCR/EXPIRE counter, but supply their own Redis: the dashboard
 * uses Upstash (REST), the gateway uses ioredis (REDIS_URL) — separate
 * instances. The fail-open vs. fail-closed decision differs per host (test runs
 * fail open in the gateway but closed in the dashboard), so callers pass it in.
 */
export interface FixedWindowCounterClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface FixedWindowPeriod {
  windowStart: number;
  resetAt: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface FixedWindowRateLimitOptions {
  limit?: number;
  windowSecs?: number;
  /** When the counter store errors, return success (fail open) or block (fail closed). */
  failOpen: boolean;
}

export function getFixedWindowPeriod(windowSecs: number, nowMs = Date.now()): FixedWindowPeriod {
  const now = Math.floor(nowMs / 1000);
  const windowStart = Math.floor(now / windowSecs);
  const resetAt = (windowStart + 1) * windowSecs;
  return { windowStart, resetAt };
}

export async function incrementFixedWindowCounter(
  client: FixedWindowCounterClient,
  key: string,
  windowSecs: number,
): Promise<number> {
  const count = await client.incr(key);
  if (count === 1) {
    // Set expiry only on first increment so the key is cleaned up automatically
    await client.expire(key, windowSecs);
  }
  return count;
}

/**
 * Fixed-window rate limiter backed by Redis INCR.
 *
 * @param client     Counter client exposing INCR/EXPIRE (ioredis or Upstash)
 * @param key        Unique key scoped to the caller and action, e.g. `webhook:${orgId}`
 * @param options    `limit`/`windowSecs` defaults, plus the `failOpen` policy
 */
export async function fixedWindowRateLimit(
  client: FixedWindowCounterClient,
  key: string,
  { limit = 60, windowSecs = 60, failOpen }: FixedWindowRateLimitOptions,
): Promise<RateLimitResult> {
  const { windowStart, resetAt } = getFixedWindowPeriod(windowSecs);
  const windowKey = `rl:${key}:${windowStart}`;

  try {
    const count = await incrementFixedWindowCounter(client, windowKey, windowSecs);
    return { success: count <= limit, remaining: Math.max(0, limit - count), reset: resetAt };
  } catch {
    return failOpen
      ? { success: true, remaining: limit, reset: resetAt }
      : { success: false, remaining: 0, reset: resetAt };
  }
}
