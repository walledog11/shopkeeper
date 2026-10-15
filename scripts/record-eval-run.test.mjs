import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { recordEvalInvocation } from './record-eval-run.mjs';

test('records accepted eval configuration without secrets', () => {
  const originalCwd = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), 'shopkeeper-eval-ledger-'));
  try {
    process.chdir(directory);
    recordEvalInvocation('targeted-test', {
      EVAL_SUITE: 'full',
      EVAL_FIXTURE: 'fixture-a',
      EVAL_REPEATS: '2',
      RUN_JUDGE_EVALS: '0',
      EVAL_MAX_USD: '0.10',
      EVAL_MAX_MODEL_CALLS: '8',
      CI: 'true',
      GITHUB_RUN_ID: '123',
      ANTHROPIC_API_KEY: 'must-not-be-recorded',
    });
    const row = JSON.parse(readFileSync('test-results/eval-ledger.jsonl', 'utf8'));
    assert.equal(row.label, 'targeted-test');
    assert.equal(row.fixtures, 'fixture-a');
    assert.equal(row.maxUsd, '0.10');
    assert.equal(row.githubRunId, '123');
    assert.equal('ANTHROPIC_API_KEY' in row, false);
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
});
