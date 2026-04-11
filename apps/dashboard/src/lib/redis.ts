import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    // Prevent unhandled 'error' events from crashing the serverless function.
    // Actual command errors are caught in the caller (rate-limit.ts).
    redis.on('error', () => {});
  }
  return redis;
}
