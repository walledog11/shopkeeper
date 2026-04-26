import { Redis } from '@upstash/redis';
import { getDashboardRedisEnv } from './env';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const { url, token } = getDashboardRedisEnv();
    redis = new Redis({
      url,
      token,
    });
  }
  return redis;
}
