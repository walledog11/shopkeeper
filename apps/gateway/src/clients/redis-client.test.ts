import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisInstances: Array<Record<string, unknown>> = [];

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (this: Record<string, unknown>, ...args: unknown[]) {
    const instance = {
      on: vi.fn().mockReturnThis(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
      setMaxListeners: vi.fn(),
      args,
    };
    Object.assign(this, instance);
    redisInstances.push(this);
    return this;
  }),
}));

import {
  closeGatewayRedisConnections,
  getGatewayBullMqProducerConnection,
  getGatewayBullMqWorkerConnection,
  getGatewayRedis,
  resetGatewayRedisConnectionsForTests,
} from './redis-client.js';
import { resetGatewayBullMqQueuesForTests } from './gateway-queues.js';

beforeEach(() => {
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  redisInstances.length = 0;
  resetGatewayRedisConnectionsForTests();
  resetGatewayBullMqQueuesForTests();
});

afterEach(async () => {
  await closeGatewayRedisConnections();
  resetGatewayRedisConnectionsForTests();
  resetGatewayBullMqQueuesForTests();
});

describe('gateway redis singletons', () => {
  it('reuses the shared Redis client', () => {
    const first = getGatewayRedis();
    const second = getGatewayRedis();

    expect(second).toBe(first);
    expect(redisInstances).toHaveLength(1);
  });

  it('reuses the BullMQ producer and worker connections separately', () => {
    const producer = getGatewayBullMqProducerConnection();
    const worker = getGatewayBullMqWorkerConnection();

    expect(getGatewayBullMqProducerConnection()).toBe(producer);
    expect(getGatewayBullMqWorkerConnection()).toBe(worker);
    expect(producer).not.toBe(worker);
    expect(redisInstances).toHaveLength(2);
    expect(worker.setMaxListeners).toHaveBeenCalledWith(20);
  });

  it('creates a dedicated worker connection with maxRetriesPerRequest disabled', () => {
    getGatewayBullMqWorkerConnection();

    const workerInstance = redisInstances[0] as { args?: unknown[] };
    expect(workerInstance.args?.[1]).toEqual({ maxRetriesPerRequest: null });
  });
});
