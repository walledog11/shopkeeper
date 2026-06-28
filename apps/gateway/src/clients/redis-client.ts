import type { ConnectionOptions } from 'bullmq';
import { Redis as IORedis, type RedisOptions } from 'ioredis';
import logger from '../logger.js';

export type GatewayBullMqConnection = ConnectionOptions & IORedis;

/**
 * Expected live Redis connection count per gateway runtime role:
 * - `server`: 2 (shared Redis + BullMQ producer)
 * - `worker`: 3 (shared Redis + BullMQ producer + BullMQ worker)
 * - `all`: server and worker are separate processes, so counts add per child (2 + 3).
 *
 * BullMQ workers must keep a dedicated blocking connection (`maxRetriesPerRequest: null`).
 * Do not collapse producer and worker connections into one client.
 */

let sharedRedis: IORedis | null = null;
let subscriberConnection: IORedis | null = null;
let producerConnection: GatewayBullMqConnection | null = null;
let workerConnection: GatewayBullMqConnection | null = null;

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

export function getGatewayRedis(): IORedis {
  if (!sharedRedis) {
    sharedRedis = createGatewayRedisClient();
    sharedRedis.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[GatewayRedis] Shared Redis error');
    });
  }

  return sharedRedis;
}

// Dedicated connection for realtime pub/sub. ioredis cannot run normal commands
// on a connection that's in subscriber mode, so this must never be shared with
// the command client or the BullMQ connections.
export function getGatewayRedisSubscriber(): IORedis {
  if (!subscriberConnection) {
    subscriberConnection = createGatewayRedisClient();
    subscriberConnection.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[GatewayRedis] Subscriber error');
    });
  }

  return subscriberConnection;
}

export function getGatewayBullMqProducerConnection(): GatewayBullMqConnection {
  if (producerConnection) {
    return producerConnection;
  }

  const connection = createGatewayBullMqConnection();
  connection.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[GatewayRedis] BullMQ producer error');
  });
  producerConnection = connection;
  return connection;
}

export function getGatewayBullMqWorkerConnection(): GatewayBullMqConnection {
  if (workerConnection) {
    return workerConnection;
  }

  const connection = createGatewayBullMqConnection({ maxRetriesPerRequest: null });
  connection.setMaxListeners(20);
  connection.on('error', (err: Error) => {
    logger.error({ err: err.message }, '[GatewayRedis] BullMQ worker error');
  });
  workerConnection = connection;
  return connection;
}

export async function closeGatewayRedisConnections(): Promise<void> {
  const closers: Promise<unknown>[] = [];

  if (sharedRedis) {
    const redis = sharedRedis;
    sharedRedis = null;
    closers.push(redis.quit().catch(() => redis.disconnect()));
  }

  if (subscriberConnection) {
    const redis = subscriberConnection;
    subscriberConnection = null;
    closers.push(redis.quit().catch(() => redis.disconnect()));
  }

  if (producerConnection) {
    const connection = producerConnection;
    producerConnection = null;
    closers.push(connection.quit().catch(() => connection.disconnect()));
  }

  if (workerConnection) {
    const connection = workerConnection;
    workerConnection = null;
    closers.push(connection.quit().catch(() => connection.disconnect()));
  }

  await Promise.all(closers);
}

export function resetGatewayRedisConnectionsForTests(): void {
  sharedRedis = null;
  subscriberConnection = null;
  producerConnection = null;
  workerConnection = null;
}
