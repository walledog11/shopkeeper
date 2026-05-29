import { NextResponse } from 'next/server';
import { Redis as IORedis } from 'ioredis';
import { getRedis } from '@/lib/server/redis';

interface RateLimitOptions {
  forceForE2E?: boolean;
}

interface RedisRateLimitClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

let e2eRedis: IORedis | null = null;

/**
 * Fixed-window rate limiter backed by Redis INCR.
 *
 * Fails **closed** in production if Redis is unavailable , prevents rate-limit bypass.
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
  options: RateLimitOptions = {},
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSecs);
  const windowKey = `rl:${key}:${windowStart}`;
  const reset = (windowStart + 1) * windowSecs;

  if (isE2ERateLimitBypassEnabled(process.env, options)) {
    return { success: true, remaining: limit, reset };
  }

  try {
    const client = getRateLimitClient(options);
    const count = await client.incr(windowKey);
    if (count === 1) {
      // Set expiry only on first increment so the key is cleaned up automatically
      await client.expire(windowKey, windowSecs);
    }
    return { success: count <= limit, remaining: Math.max(0, limit - count), reset };
  } catch {
    // Redis unavailable , fail closed in production to prevent rate-limit bypass
    if (process.env.NODE_ENV !== 'development') {
      return { success: false, remaining: 0, reset };
    }
    return { success: true, remaining: limit, reset };
  }
}

function getRateLimitClient(options: RateLimitOptions): RedisRateLimitClient {
  if (isE2ERateLimitForceEnabled(process.env, options)) {
    return getE2ERedis();
  }

  return getRedis();
}

function getE2ERedis(): IORedis {
  if (!e2eRedis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for E2E rate-limit enforcement');
    }
    e2eRedis = new IORedis(redisUrl);
    e2eRedis.on('error', () => undefined);
  }
  return e2eRedis;
}

export function isE2ERateLimitBypassEnabled(
  env: NodeJS.ProcessEnv = process.env,
  options: RateLimitOptions = {},
): boolean {
  return readEnv(env, 'NODE_ENV') !== 'production' &&
    readEnv(env, 'E2E_TEST_RUN') === 'true' &&
    !isE2ERateLimitForceEnabled(env, options);
}

export function isE2ERateLimitForceEnabled(
  env: NodeJS.ProcessEnv = process.env,
  options: RateLimitOptions = {},
): boolean {
  return readEnv(env, 'NODE_ENV') === 'test' &&
    readEnv(env, 'E2E_TEST_RUN') === 'true' &&
    readEnv(env, 'E2E_RATE_LIMIT_TEST_MODE') === 'force-header' &&
    options.forceForE2E === true;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name];
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
