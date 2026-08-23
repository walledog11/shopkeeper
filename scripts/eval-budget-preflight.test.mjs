import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('release budget reserves the bounded gateway cost without starving dashboard fixtures', () => {
  const result = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'release',
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.75',
    '--max-calls', '120',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /allocations dashboard=\$0\.7000\/114calls gateway=\$0\.0500\/6calls/,
  );
});
