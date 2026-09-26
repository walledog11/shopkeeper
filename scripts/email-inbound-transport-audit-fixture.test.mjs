import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('email inbound transport audit passes --strict on empty test database', () => {
  const result = spawnSync(
    'node',
    ['./scripts/with-test-env.mjs', 'node', './scripts/audit-email-inbound-transport.mjs', '--', '--strict'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env },
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || 'audit-email-inbound-transport --strict failed',
  );
});
