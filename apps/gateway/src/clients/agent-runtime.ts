import { Queue } from 'bullmq';
import type { Redis as IORedis } from 'ioredis';
import type { LockProvider } from '@shopkeeper/agent/lock';
import { PROCESSING_QUEUE_DEFAULTS, QUEUE } from '../constants.js';
import type { CustomerMemoryJobData } from '../types.js';
import { createGatewayBullMqConnection, createGatewayRedisClient } from './redis-client.js';
import { createGatewayLockProvider } from './agent-lock.js';

// Lazy process-singletons for the worker's in-process agent runtime (Track 4.2).
// Created on first use (mirroring the dashboard's lazy turn-deps) so importing
// this module never opens a Redis connection — keeps tests and non-worker roles
// from connecting eagerly.

let lockRedis: IORedis | null = null;
let lockProvider: LockProvider | null = null;
let customerMemoryQueue: Queue<CustomerMemoryJobData> | null = null;

export function getGatewayLockProvider(): LockProvider {
  if (!lockProvider) {
    lockRedis = createGatewayRedisClient();
    lockProvider = createGatewayLockProvider(lockRedis);
  }
  return lockProvider;
}

export function getCustomerMemoryQueue(): Queue<CustomerMemoryJobData> {
  if (!customerMemoryQueue) {
    customerMemoryQueue = new Queue<CustomerMemoryJobData>(QUEUE.CUSTOMER_MEMORY, {
      connection: createGatewayBullMqConnection(),
      defaultJobOptions: PROCESSING_QUEUE_DEFAULTS,
    });
  }
  return customerMemoryQueue;
}
