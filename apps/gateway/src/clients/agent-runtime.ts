import type { LockProvider } from '@shopkeeper/agent/lock';
import { getGatewayRedis } from './redis-client.js';
import { createGatewayLockProvider } from './agent-lock.js';

// Lazy process-singleton for the worker's in-process agent runtime. Created on
// first use so importing this module never opens Redis — tests and server-only
// roles stay connection-free until a turn actually runs.

let lockProvider: LockProvider | null = null;

export function getGatewayLockProvider(): LockProvider {
  if (!lockProvider) {
    lockProvider = createGatewayLockProvider(getGatewayRedis());
  }
  return lockProvider;
}
