// Live-model eval runs are the dominant line on the API bill: 74% of spend over
// 2026-08-16..19, and only a quarter of the runs left any log behind. Both the
// full suite and a baseline capture are gated so the cost is stated before it is
// spent. CI bypasses; single-fixture probes (test:evals:fixture) skip this
// confirmation but still require both ceilings.

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
    `    gh workflow run evals.yml -f mode=baseline -f max_usd=${cost} -f max_model_calls=${calls}`,
    '',
    '  Cheaper locally:',
    '    EVAL_MAX_USD=0.10 EVAL_MAX_MODEL_CALLS=20 EVAL_FIXTURE=<fixture-id> npm run test:evals:fixture -w apps/dashboard',
    '',
    '  To run it here anyway:',
    `    EVAL_CONFIRM=1 EVAL_MAX_USD=${cost} EVAL_MAX_MODEL_CALLS=${calls} npm run ${label} -w apps/dashboard`,
    '',
  ].join('\n'),
);
process.exit(1);
