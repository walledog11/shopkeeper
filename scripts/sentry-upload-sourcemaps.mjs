#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { env, argv, exit } from 'node:process';

const distDir = argv[2] || 'dist';

if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG || !env.SENTRY_PROJECT) {
  console.log(`[sentry] SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT not all set — skipping source map upload`);
  exit(0);
}

if (!existsSync(distDir)) {
  console.log(`[sentry] ${distDir} not found — skipping source map upload`);
  exit(0);
}

const rawRelease =
  env.SENTRY_RELEASE ||
  env.RAILWAY_GIT_COMMIT_SHA ||
  env.VERCEL_GIT_COMMIT_SHA ||
  '';

const release = rawRelease
  ? rawRelease.includes('@')
    ? rawRelease
    : `shopkeeper@${rawRelease}`
  : '';

const cliEnv = { ...env, SENTRY_LOG_LEVEL: env.SENTRY_LOG_LEVEL || 'warn' };

const inject = spawnSync('npx', ['--no-install', 'sentry-cli', 'sourcemaps', 'inject', distDir], {
  stdio: 'inherit',
  env: cliEnv,
});
if (inject.status !== 0) {
  console.error('[sentry] sourcemaps inject failed; skipping upload');
  exit(0);
}

const uploadArgs = ['--no-install', 'sentry-cli', 'sourcemaps', 'upload'];
if (release) uploadArgs.push('--release', release);
uploadArgs.push(distDir);

const upload = spawnSync('npx', uploadArgs, { stdio: 'inherit', env: cliEnv });
if (upload.status !== 0) {
  console.error('[sentry] sourcemaps upload failed');
  exit(0);
}

console.log(`[sentry] source maps uploaded${release ? ` for release ${release}` : ''}`);
