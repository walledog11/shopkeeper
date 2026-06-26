import { NextResponse } from 'next/server';
import { Redis as IORedis } from 'ioredis';
import {
  fixedWindowRateLimit,
  getFixedWindowPeriod,
  type FixedWindowCounterClient,
  type RateLimitResult,
} from '@shopkeeper/agent/rate-limit';
import { getRedis } from '@/lib/server/redis';

interface RateLimitOptions {
  forceForE2E?: boolean;
}

let e2eRedis: IORedis | null = null;

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
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const { resetAt: reset } = getFixedWindowPeriod(windowSecs);

  if (isE2ERateLimitBypassEnabled(process.env, options)) {
    return { success: true, remaining: limit, reset };
  }

  // Fail closed outside development so a missing Redis can't bypass the limit.
  const failOpen = process.env.NODE_ENV === 'development';

  try {
    const client = getRateLimitClient(options);
    return await fixedWindowRateLimit(client, key, { limit, windowSecs, failOpen });
  } catch {
    // Resolving the client threw (e.g. Redis env missing) — apply the same policy.
    return failOpen
      ? { success: true, remaining: limit, reset }
      : { success: false, remaining: 0, reset };
  }
}

function getRateLimitClient(options: RateLimitOptions): FixedWindowCounterClient {
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
