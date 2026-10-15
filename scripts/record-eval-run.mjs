import { appendFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function recordEvalInvocation(label, env = process.env) {
  let sha = null;
  try {
    sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // A ledger line is still useful in an exported source tree without .git.
  }
  mkdirSync('test-results', { recursive: true });
  appendFileSync('test-results/eval-ledger.jsonl', `${JSON.stringify({
    timestamp: new Date().toISOString(),
    label,
    sha,
    suite: env.EVAL_SUITE ?? null,
    fixtures: env.EVAL_FIXTURE ?? null,
    repeats: env.EVAL_REPEATS ?? '1',
    judges: env.RUN_JUDGE_EVALS ?? null,
    maxUsd: env.EVAL_MAX_USD ?? null,
    maxModelCalls: env.EVAL_MAX_MODEL_CALLS ?? null,
    ci: env.CI === 'true',
    githubRunId: env.GITHUB_RUN_ID ?? null,
    githubRunAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const label = process.argv[2]?.trim();
  if (!label) throw new Error('record-eval-run requires a label');
  if (!process.env.EVAL_MAX_USD || !process.env.EVAL_MAX_MODEL_CALLS) {
    throw new Error('Paid eval commands require EVAL_MAX_USD and EVAL_MAX_MODEL_CALLS');
  }
  recordEvalInvocation(label);
}
