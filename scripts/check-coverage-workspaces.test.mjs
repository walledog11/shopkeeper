import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  listCoverageWorkspaceTargets,
  validateCoverageWorkspaceScripts,
} from './lib/coverage-workspaces.mjs';

test('listCoverageWorkspaceTargets parses npm workspace flags from the root script', () => {
  const script = [
    'node ./scripts/test-bootstrap.mjs',
    '&& npm run test:coverage -w apps/dashboard',
    '&& npm run test:coverage -w packages/integrations',
    '&& node ./scripts/check-critical-coverage.mjs',
  ].join(' ');

  assert.deepEqual(listCoverageWorkspaceTargets(script), [
    'apps/dashboard',
    'packages/integrations',
  ]);
});

test('validateCoverageWorkspaceScripts fails when a listed workspace lacks test:coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-workspaces-'));
  const workspace = join(root, 'packages/example');
  mkdirSync(workspace, { recursive: true });

  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: {
      'test:coverage': 'npm run test:coverage -w packages/example',
    },
  }));
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({
    name: '@shopkeeper/example',
    scripts: { build: 'tsc' },
  }));

  assert.deepEqual(validateCoverageWorkspaceScripts(root), [
    'packages/example is listed in root scripts.test:coverage but does not define scripts.test:coverage.',
  ]);
});

test('validateCoverageWorkspaceScripts passes when every listed workspace defines test:coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-workspaces-'));
  const workspace = join(root, 'packages/example');
  mkdirSync(workspace, { recursive: true });

  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: {
      'test:coverage': 'npm run test:coverage -w packages/example',
    },
  }));
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({
    name: '@shopkeeper/example',
    scripts: { 'test:coverage': 'vitest run --coverage' },
  }));

  assert.deepEqual(validateCoverageWorkspaceScripts(root), []);
});
