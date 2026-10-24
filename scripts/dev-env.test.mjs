import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSharedDevEnv } from './dev.mjs';
import { assertLocalDevEnv, getDevEnv } from './with-dev-env.mjs';

test('shared dev settings override conflicting app targets and production mode, with shell overrides last', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'shopkeeper-dev-env-'));
  try {
    mkdirSync(path.join(root, 'apps/gateway'), { recursive: true });
    mkdirSync(path.join(root, 'apps/dashboard'), { recursive: true });
    writeFileSync(path.join(root, 'apps/gateway/.env'), 'NODE_ENV=production\nDASHBOARD_URL=https://production.example.com\nREDIS_URL=redis://localhost:6379\n');
    writeFileSync(path.join(root, 'apps/dashboard/.env.local'), 'DATABASE_URL=postgresql://localhost:5432/wrong\n');
    const shared = createSharedDevEnv({});
    writeFileSync(path.join(root, '.env.development.local'), Object.entries(shared).map(([key, value]) => `${key}=${value}`).join('\n'));
    const env = getDevEnv({ INTERNAL_API_SECRET: 'shell-secret' }, { repoRoot: root });
    assert.equal(env.DATABASE_URL, shared.DATABASE_URL);
    assert.equal(env.DASHBOARD_URL, 'http://localhost:3000');
    assert.equal(env.REDIS_URL, 'redis://127.0.0.1:56379/1');
    assert.equal(env.INTERNAL_API_SECRET, 'shell-secret');
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.SHOPKEEPER_LOCAL_DEV, 'true');
    assert.doesNotThrow(() => assertLocalDevEnv(env));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('local development refuses production databases, the integration database and shared test queues', () => {
  const local = createSharedDevEnv({});
  for (const patch of [
    { DATABASE_URL: 'postgresql://user:secret@prod.neon.tech/shopkeeper_dev' },
    { DIRECT_DATABASE_URL: 'postgresql://user:secret@prod.neon.tech/shopkeeper_dev' },
    { DATABASE_URL: 'postgresql://localhost:55432/clerk_test' },
    { REDIS_URL: 'redis://localhost:56379/0' },
    { DASHBOARD_URL: 'https://app.example.com' },
    { DIRECT_DATABASE_URL: 'postgresql://localhost:5432/shopkeeper_dev' },
    { NEON_SERVERLESS_HTTP: 'true' },
  ]) assert.throws(() => assertLocalDevEnv({ ...local, ...patch }), /\[dev\]/);
});

test('setup preserves token encryption and internal secrets while generating missing local secrets', () => {
  const existing = { TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), INTERNAL_API_SECRET: 'existing-secret', OAUTH_ATTEMPT_SECRET: 'existing-oauth-secret-with-enough-characters' };
  const env = createSharedDevEnv(existing);
  for (const [key, value] of Object.entries(existing)) assert.equal(env[key], value);
  const fresh = createSharedDevEnv({ INTERNAL_API_SECRET: 'replace-me' });
  assert.match(fresh.TOKEN_ENCRYPTION_KEY, /^[a-f\d]{64}$/);
  assert.match(fresh.INTERNAL_API_SECRET, /^[a-f\d]{64}$/);
  assert.notEqual(fresh.INTERNAL_API_SECRET, fresh.OAUTH_ATTEMPT_SECRET);
});
