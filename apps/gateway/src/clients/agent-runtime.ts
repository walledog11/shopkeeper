import type { Redis as IORedis } from 'ioredis';
import type { LockProvider } from '@shopkeeper/agent/lock';
import { createGatewayRedisClient } from './redis-client.js';
import { createGatewayLockProvider } from './agent-lock.js';

// Lazy process-singletons for the worker's in-process agent runtime (Track 4.2).
// Created on first use (mirroring the dashboard's lazy turn-deps) so importing
// this module never opens a Redis connection — keeps tests and non-worker roles
// from connecting eagerly.

let lockRedis: IORedis | null = null;
let lockProvider: LockProvider | null = null;

export function getGatewayLockProvider(): LockProvider {
  if (!lockProvider) {
    lockRedis = createGatewayRedisClient();
    lockProvider = createGatewayLockProvider(lockRedis);
  }
  return lockProvider;
}
