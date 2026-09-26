import assert from 'node:assert/strict';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB_HOST = '127.0.0.1';
const TEST_DB_PORT = 55432;

function testDatabaseReachable() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: TEST_DB_HOST, port: TEST_DB_PORT }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

test('email inbound transport audit passes --strict on empty test database', async (t) => {
  if (!(await testDatabaseReachable())) {
    t.skip(`test database not reachable at ${TEST_DB_HOST}:${TEST_DB_PORT} (npm run test:services:up)`);
  }

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
