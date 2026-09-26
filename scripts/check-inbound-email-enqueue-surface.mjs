#!/usr/bin/env node
// Phase 3 gate: process-email jobs must be enqueued via enqueueInboundEmail only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const GATEWAY_SRC = join(REPO_ROOT, 'apps/gateway/src');
const ALLOWED = new Set([
  join(GATEWAY_SRC, 'inbound/enqueue-inbound-email.ts'),
]);

const ENQUEUE_PATTERN = /\.add\s*\(\s*(JOB\.EMAIL|'process-email'|"process-email")/;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'dist' || name === 'coverage') continue;
      walk(path, files);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
for (const file of walk(GATEWAY_SRC)) {
  if (ALLOWED.has(file)) continue;
  const content = readFileSync(file, 'utf8');
  if (ENQUEUE_PATTERN.test(content)) {
    violations.push(file.replace(`${REPO_ROOT}/`, ''));
  }
}

if (violations.length > 0) {
  console.error('[check-inbound-email-enqueue-surface] Direct process-email enqueue outside enqueueInboundEmail:');
  for (const file of violations) console.error(`  - ${file}`);
  process.exitCode = 1;
} else {
  console.log('[check-inbound-email-enqueue-surface] OK');
}
