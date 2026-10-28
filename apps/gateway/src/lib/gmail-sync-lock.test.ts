import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireGmailIntegrationLock,
  GmailSyncLockLostError,
} from './gmail-sync-lock.js';

vi.mock('../logger.js', () => ({
  default: {
    warn: vi.fn(),
  },
}));

function redis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    eval: vi.fn().mockResolvedValue(1),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('acquireGmailIntegrationLock', () => {
  it('renews the token-owned lease while work is still active', async () => {
    vi.useFakeTimers();
    const client = redis();
    const lock = await acquireGmailIntegrationLock(client, 'integration-1');

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'gmail-sync:lock:integration-1',
      expect.any(String),
      '900000',
    );
    lock.assertOwned();
    await lock.release();
  });

  it('refuses to commit after another owner has replaced the lease', async () => {
    vi.useFakeTimers();
    const client = redis();
    client.eval.mockResolvedValueOnce(0);
    const lock = await acquireGmailIntegrationLock(client, 'integration-1');

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000);

    expect(() => lock.assertOwned()).toThrow(GmailSyncLockLostError);
    await lock.release();
  });

  it('coalesces overlapping renewals and stops renewing after release', async () => {
    const client = redis();
    let resolveRenewal: ((value: number) => void) | undefined;
    client.eval.mockImplementationOnce(() => new Promise<number>((resolve) => {
      resolveRenewal = resolve;
    }));
    const lock = await acquireGmailIntegrationLock(client, 'integration-1');

    const first = lock.renew();
    const second = lock.renew();
    expect(client.eval).toHaveBeenCalledTimes(1);
    resolveRenewal?.(1);
    await Promise.all([first, second]);

    await lock.release();
    const callsAfterRelease = client.eval.mock.calls.length;
    await lock.renew();
    expect(client.eval).toHaveBeenCalledTimes(callsAfterRelease);
  });

  it('marks the lease lost when Redis renewal fails', async () => {
    const client = redis();
    client.eval.mockRejectedValueOnce(new Error('Redis unavailable'));
    const lock = await acquireGmailIntegrationLock(client, 'integration-1');

    await lock.renew();

    expect(() => lock.assertOwned()).toThrow(GmailSyncLockLostError);
    await lock.release();
  });
});
