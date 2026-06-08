#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { env, argv, exit } from 'node:process';
import { hasSentryUploadCredentials, resolveSentryRelease } from './sentry-release.mjs';

const distDir = argv[2] || 'dist';
const stripPublicMaps = argv.includes('--strip-public-maps');

if (!hasSentryUploadCredentials(env)) {
  console.log('[sentry] SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT not all set — skipping source map upload');
  exit(0);
}

if (!existsSync(distDir)) {
  console.error(`[sentry] ${distDir} not found — cannot upload source maps`);
  exit(1);
}

const release = resolveSentryRelease(env);
const cliEnv = { ...env, SENTRY_LOG_LEVEL: env.SENTRY_LOG_LEVEL || 'warn' };

const inject = spawnSync('npx', ['--no-install', 'sentry-cli', 'sourcemaps', 'inject', distDir], {
  stdio: 'inherit',
  env: cliEnv,
});
if (inject.status !== 0) {
  console.error('[sentry] sourcemaps inject failed');
  exit(1);
}

const uploadArgs = ['--no-install', 'sentry-cli', 'sourcemaps', 'upload'];
if (release) uploadArgs.push('--release', release);
uploadArgs.push(distDir);

const upload = spawnSync('npx', uploadArgs, { stdio: 'inherit', env: cliEnv });
if (upload.status !== 0) {
  console.error('[sentry] sourcemaps upload failed');
  exit(1);
}

if (stripPublicMaps) {
  const removed = removePublicSourceMaps(join(distDir, 'static'));
  if (removed > 0) {
    console.log(`[sentry] removed ${removed} public client source map file(s)`);
  }
}

console.log(`[sentry] source maps uploaded${release ? ` for release ${release}` : ''}`);

function removePublicSourceMaps(rootDir) {
  if (!existsSync(rootDir)) {
    return 0;
  }

  let removed = 0;
  for (const entry of readdirSync(rootDir)) {
    const absolutePath = join(rootDir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      removed += removePublicSourceMaps(absolutePath);
      continue;
    }

    if (entry.endsWith('.map')) {
      unlinkSync(absolutePath);
      removed += 1;
    }
  }

  return removed;
}
