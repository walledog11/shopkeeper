import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSentryUploadCredentials, resolveSentryRelease } from './sentry-release.mjs';

test('resolveSentryRelease prefixes bare commit shas', () => {
  assert.equal(resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: 'abc123' }), 'shopkeeper@abc123');
  assert.equal(resolveSentryRelease({ RAILWAY_GIT_COMMIT_SHA: 'def456' }), 'shopkeeper@def456');
});

test('resolveSentryRelease prefixes explicit release values without @', () => {
  assert.equal(resolveSentryRelease({ SENTRY_RELEASE: 'shopkeeper@release-1' }), 'shopkeeper@release-1');
  assert.equal(resolveSentryRelease({ SENTRY_RELEASE: 'release-1' }), 'shopkeeper@release-1');
});

test('hasSentryUploadCredentials requires all upload vars', () => {
  assert.equal(hasSentryUploadCredentials({}), false);
  assert.equal(
    hasSentryUploadCredentials({
      SENTRY_AUTH_TOKEN: 'token',
      SENTRY_ORG: 'org',
      SENTRY_PROJECT: 'project',
    }),
    true,
  );
});
