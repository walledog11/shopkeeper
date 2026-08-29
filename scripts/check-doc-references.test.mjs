import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECKER = join(process.cwd(), 'scripts', 'check-doc-references.mjs');

function run(setup) {
  const root = mkdtempSync(join(tmpdir(), 'doc-refs-'));
  try {
    mkdirSync(join(root, 'docs'), { recursive: true });
    mkdirSync(join(root, 'packages', 'agent', 'src'), { recursive: true });
    setup(root);
    try {
      const stdout = execFileSync(process.execPath, [CHECKER], { cwd: root, encoding: 'utf8' });
      return { code: 0, output: stdout };
    } catch (error) {
      return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SOURCE = ['const a = 1;', 'const b = 2;', 'function useful() {', '  return a + b;', '}'].join('\n');

test('passes when a reference points at a real line', () => {
  const { code } = run((root) => {
    writeFileSync(join(root, 'packages/agent/src/thing.ts'), SOURCE);
    writeFileSync(join(root, 'docs/x.md'), 'See `packages/agent/src/thing.ts:3` for it.\n');
  });
  assert.equal(code, 0);
});

test('fails when the file does not exist', () => {
  const { code, output } = run((root) => {
    writeFileSync(join(root, 'docs/x.md'), 'See `packages/agent/src/gone.ts:3`.\n');
  });
  assert.equal(code, 1);
  assert.match(output, /no such file/);
});

test('fails when the line is past the end of the file', () => {
  const { code, output } = run((root) => {
    writeFileSync(join(root, 'packages/agent/src/thing.ts'), SOURCE);
    writeFileSync(join(root, 'docs/x.md'), 'See `packages/agent/src/thing.ts:900`.\n');
  });
  assert.equal(code, 1);
  assert.match(output, /file has 5 lines/);
});

// The quiet failure: still in range, so nothing errors, but the citation now
// points at a closing brace instead of the code it named.
test('fails when the line has drifted onto a closing brace', () => {
  const { code, output } = run((root) => {
    writeFileSync(join(root, 'packages/agent/src/thing.ts'), SOURCE);
    writeFileSync(join(root, 'docs/x.md'), 'See `packages/agent/src/thing.ts:5`.\n');
  });
  assert.equal(code, 1);
  assert.match(output, /has drifted/);
});

test('leaves an ambiguous bare filename alone rather than guessing', () => {
  const { code } = run((root) => {
    mkdirSync(join(root, 'packages/agent/src/two'), { recursive: true });
    writeFileSync(join(root, 'packages/agent/src/route.ts'), SOURCE);
    writeFileSync(join(root, 'packages/agent/src/two/route.ts'), SOURCE);
    writeFileSync(join(root, 'docs/x.md'), 'See `route.ts:5`.\n');
  });
  assert.equal(code, 0);
});
