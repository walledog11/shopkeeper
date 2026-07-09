import { randomUUID } from 'node:crypto';
import logger from '../logger.js';

const GMAIL_SYNC_LOCK_TTL_MS = 15 * 60 * 1_000;
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export interface GmailSyncRedis {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    setMode: 'NX',
  ): Promise<unknown>;
  eval(script: string, numberOfKeys: number, key: string, token: string): Promise<unknown>;
}

export class GmailSyncLockUnavailableError extends Error {
  constructor() {
    super('Gmail integration sync is already in progress');
    this.name = 'GmailSyncLockUnavailableError';
  }
}

export async function acquireGmailIntegrationLock(
  redis: GmailSyncRedis,
  integrationId: string,
): Promise<{ release: () => Promise<void> }> {
  const key = `gmail-sync:lock:${integrationId}`;
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', GMAIL_SYNC_LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') throw new GmailSyncLockUnavailableError();

  return {
    release: async () => {
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      } catch {
        logger.warn({ integrationId }, '[Gmail Sync] Failed to release integration lock');
      }
    },
  };
}
