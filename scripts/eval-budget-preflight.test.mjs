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
  assert.match(result.stdout, /calls=118\/120/);
});

test('release preflight rejects the call ceiling exhausted by the observed suite', () => {
  const result = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'release',
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.75',
    '--max-calls', '100',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Estimated 118 calls exceeds the approved 100-call ceiling/);
});

test('targeted preflight accounts for isolated cold-cache cost and planner call bounds', () => {
  const threeFixtures = [
    'tier-trusted-refund-over-cap',
    'tier-trusted-refund-under-cap',
    'tier-watch-refund-draft-only',
  ].join(',');
  const undersized = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'targeted',
    '--fixtures', threeFixtures,
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.05',
    '--max-calls', '6',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(undersized.status, 0);
  assert.match(undersized.stderr, /exceeds the approved \$0\.05 ceiling/);

  const exhausted = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'targeted',
    '--fixtures', 'tier-watch-refund-draft-only',
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.03',
    '--max-calls', '3',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(exhausted.status, 0);
  assert.match(exhausted.stderr, /Estimated \$0\.06 exceeds the approved \$0\.03 ceiling/);

  const callExhausted = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'targeted',
    '--fixtures', 'tier-watch-refund-draft-only',
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.10',
    '--max-calls', '3',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(callExhausted.status, 0);
  assert.match(callExhausted.stderr, /Estimated 20 calls exceeds the approved 3-call ceiling/);

  const bounded = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'targeted',
    '--fixtures', 'tier-watch-refund-draft-only',
    '--repeats', '1',
    '--judges', 'off',
    '--max-usd', '0.10',
    '--max-calls', '20',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(bounded.status, 0, bounded.stderr);
  assert.match(bounded.stdout, /estimate=\$0\.0552\/0\.10 calls=20\/20/);
  assert.match(bounded.stdout, /allocations dashboard=\$0\.1000\/20calls gateway=\$0\.0000\/0calls/);
});

test('targeted call bound includes execution and a gated judge', () => {
  const result = spawnSync(process.execPath, [
    'scripts/eval-budget-preflight.mjs',
    '--mode', 'targeted',
    '--fixtures', 'escalate-ambiguous-customer',
    '--repeats', '1',
    '--judges', 'on',
    '--max-usd', '1.00',
    '--max-calls', '30',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Estimated 31 calls exceeds the approved 30-call ceiling/);
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
