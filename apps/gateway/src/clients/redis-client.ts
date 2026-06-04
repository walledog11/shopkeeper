import type { ConnectionOptions } from 'bullmq';
import { Redis as IORedis, type RedisOptions } from 'ioredis';

export type GatewayBullMqConnection = ConnectionOptions & IORedis;

export function getGatewayRedisUrl(db = 0): string {
  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    throw new Error('[Gateway] Missing required environment variable: REDIS_URL');
  }

  const redisUrl = new URL(rawUrl);
  redisUrl.pathname = `/${db}`;
  return redisUrl.toString();
}

export function createGatewayRedisClient(options?: RedisOptions): IORedis {
  if (options) {
    return new IORedis(getGatewayRedisUrl(), options);
  }

  return new IORedis(getGatewayRedisUrl());
}

export function createGatewayBullMqConnection(options?: RedisOptions): GatewayBullMqConnection {
  return createGatewayRedisClient(options) as GatewayBullMqConnection;
}

export function toGatewayBullMqConnection(redis: IORedis): GatewayBullMqConnection {
  return redis as GatewayBullMqConnection;
}
