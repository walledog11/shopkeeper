import { randomUUID } from 'node:crypto';
import logger from '../logger.js';

const GMAIL_SYNC_LOCK_TTL_MS = 15 * 60 * 1_000;
const GMAIL_SYNC_LOCK_RENEW_INTERVAL_MS = Math.floor(GMAIL_SYNC_LOCK_TTL_MS / 3);
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const RENEW_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';

export interface GmailSyncRedis {
  set(
    key: string,
    value: string,
    expiryMode: 'PX',
    ttlMilliseconds: number,
    setMode: 'NX',
  ): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}

export class GmailSyncLockUnavailableError extends Error {
  constructor() {
    super('Gmail integration sync is already in progress');
    this.name = 'GmailSyncLockUnavailableError';
  }
}

export class GmailSyncLockLostError extends Error {
  constructor() {
    super('Gmail integration sync lock was lost before completion');
    this.name = 'GmailSyncLockLostError';
  }
}

export async function acquireGmailIntegrationLock(
  redis: GmailSyncRedis,
  integrationId: string,
): Promise<{ assertOwned: () => void; release: () => Promise<void>; renew: () => Promise<void> }> {
  const key = `gmail-sync:lock:${integrationId}`;
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', GMAIL_SYNC_LOCK_TTL_MS, 'NX');
  if (acquired !== 'OK') throw new GmailSyncLockUnavailableError();

  let lost = false;
  let released = false;
  let renewalInFlight: Promise<void> | null = null;
  const renew = async (): Promise<void> => {
    if (released) return;
    if (renewalInFlight) return renewalInFlight;

    const renewal = (async () => {
      try {
        const renewed = await redis.eval(
          RENEW_LOCK_SCRIPT,
          1,
          key,
          token,
          String(GMAIL_SYNC_LOCK_TTL_MS),
        );
        if (renewed !== 1) lost = true;
      } catch {
        lost = true;
        logger.warn({ integrationId }, '[Gmail Sync] Failed to renew integration lock');
      }
    })();
    renewalInFlight = renewal;
    try {
      await renewal;
    } finally {
      if (renewalInFlight === renewal) renewalInFlight = null;
    }
  };
  const renewalTimer = setInterval(() => {
    void renew();
  }, GMAIL_SYNC_LOCK_RENEW_INTERVAL_MS);
  renewalTimer.unref();

  return {
    assertOwned: () => {
      if (lost) throw new GmailSyncLockLostError();
    },
    renew,
    release: async () => {
      released = true;
      clearInterval(renewalTimer);
      await renewalInFlight;
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      } catch {
        logger.warn({ integrationId }, '[Gmail Sync] Failed to release integration lock');
      }
    },
  };
}
