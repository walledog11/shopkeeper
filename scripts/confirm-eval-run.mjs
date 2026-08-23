// Live-model eval runs are the dominant line on the API bill: 74% of spend over
// 2026-08-16..19, and only a quarter of the runs left any log behind. Both the
// full suite and a baseline capture are gated so the cost is stated before it is
// spent. CI bypasses; single-fixture probes (test:evals:fixture) are never gated.

import { recordEvalInvocation } from './record-eval-run.mjs';

const [label, cost, runs] = process.argv.slice(2);

// Fixture runs, not model calls — a fixture averages 1.75 calls (planner loop
// iterations plus any judge/run-phase call), measured over the 44 core fixtures
// in CI run 32203427398. Report both so the number matches what the [eval] lines
// print at the end of a run.
const calls = Math.round(Number(runs) * 1.75);

if (process.env.CI === 'true' || process.env.EVAL_CONFIRM === '1') {
  if (!process.env.EVAL_MAX_USD || !process.env.EVAL_MAX_MODEL_CALLS) {
    throw new Error('Paid eval commands require EVAL_MAX_USD and EVAL_MAX_MODEL_CALLS');
  }
  recordEvalInvocation(label);
  process.exit(0);
}

process.stderr.write(
  [
    '',
    `Refusing to run ${label} locally.`,
    '',
    `  ~${runs} fixture runs / ~${calls} live model calls, ~$${cost}. Prefer CI:`,
    '    gh workflow run evals.yml -f mode=baseline   # full 3-repeat capture',
    '    (a PR touching packages/agent/** runs the core gate automatically)',
    '',
    '  Cheaper locally:',
    '    npm run test:evals:fixture -w apps/dashboard -- -t "<fixture-name>"',
    '',
    '  To run it here anyway:',
    `    EVAL_CONFIRM=1 EVAL_MAX_USD=${cost} EVAL_MAX_MODEL_CALLS=${calls} npm run ${label} -w apps/dashboard`,
    '',
  ].join('\n'),
);
process.exit(1);
