import { describe, expect, it } from 'vitest';
import { resolveSentryRelease } from './sentry-release.js';

describe('resolveSentryRelease', () => {
  it('returns undefined when no release env is set', () => {
    expect(resolveSentryRelease({})).toBeUndefined();
  });

  it('prefixes bare commit shas with shopkeeper@', () => {
    expect(resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: 'abc123' })).toBe('shopkeeper@abc123');
    expect(resolveSentryRelease({ RAILWAY_GIT_COMMIT_SHA: 'def456' })).toBe('shopkeeper@def456');
  });

  it('prefixes explicit release values without @', () => {
    expect(resolveSentryRelease({ SENTRY_RELEASE: 'shopkeeper@release-1' })).toBe(
      'shopkeeper@release-1',
    );
    expect(resolveSentryRelease({ SENTRY_RELEASE: 'release-1' })).toBe('shopkeeper@release-1');
  });

  it('prefers SENTRY_RELEASE over deploy commit env vars', () => {
    expect(
      resolveSentryRelease({
        SENTRY_RELEASE: 'shopkeeper@explicit',
        VERCEL_GIT_COMMIT_SHA: 'ignored',
      }),
    ).toBe('shopkeeper@explicit');
  });
});
