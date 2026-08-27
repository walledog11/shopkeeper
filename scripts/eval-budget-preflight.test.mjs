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

// Run 33120836618 authorised 700 calls, the gateway was handed a hardcoded 24,
// and the three-repeat suite died `24 / 24` after four of its five fixtures. The
// call allocation was the one term that ignored both `repeats` and the caller's
// ceiling. Assert the gateway reservation covers the work the mode actually
// dispatches, at every repeat count that mode can use.
for (const repeats of [1, 2, 3]) {
  test(`baseline reserves gateway calls that scale with ${repeats} repeat(s)`, () => {
    const result = spawnSync(process.execPath, [
      'scripts/eval-budget-preflight.mjs',
      '--mode', 'baseline',
      '--repeats', String(repeats),
      '--judges', 'on',
      '--max-usd', '5.00',
      '--max-calls', '700',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const gatewayCalls = Number(/gateway=\$[\d.]+\/(\d+)calls/.exec(result.stdout)?.[1]);
    // Five order-ops fixtures at ~2 calls each, once per repeat.
    assert.ok(
      gatewayCalls >= 5 * 2 * repeats,
      `gateway allocation ${gatewayCalls} cannot run 5 fixtures x 2 calls x ${repeats} repeats`,
    );
  });
}
