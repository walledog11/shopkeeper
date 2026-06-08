#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env, argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { hasSentryUploadCredentials, resolveSentryRelease } from './sentry-release.mjs';

const distDir = argv[2] || 'dist';
const stripPublicMaps = argv.includes('--strip-public-maps');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sentryCli = join(repoRoot, 'node_modules', '.bin', 'sentry-cli');

function missingUploadVars(currentEnv) {
  return ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].filter(
    (name) => !currentEnv[name]?.trim(),
  );
}

if (!hasSentryUploadCredentials(env)) {
  const missing = missingUploadVars(env);
  console.log(
    `[sentry] Skipping source map upload — missing build env: ${missing.join(', ')}`,
  );
  exit(0);
}

if (!existsSync(distDir)) {
  console.error(`[sentry] ${distDir} not found — cannot upload source maps`);
  exit(1);
}

if (!existsSync(sentryCli)) {
  console.error('[sentry] sentry-cli not found in node_modules/.bin — run npm install');
  exit(1);
}

const org = env.SENTRY_ORG.trim();
const project = env.SENTRY_PROJECT.trim();
const release = resolveSentryRelease(env);
const cliEnv = { ...env, SENTRY_LOG_LEVEL: env.SENTRY_LOG_LEVEL || 'warn' };

console.log(
  `[sentry] Uploading source maps from ${distDir} to ${org}/${project}${
    release ? ` (release ${release})` : ''
  }`,
);

const injectArgs = [
  sentryCli,
  'sourcemaps',
  'inject',
  '--org',
  org,
  '--project',
  project,
  distDir,
];
const inject = spawnSync(injectArgs[0], injectArgs.slice(1), {
  stdio: 'inherit',
  env: cliEnv,
});
if (inject.status !== 0) {
  console.error('[sentry] sourcemaps inject failed');
  exit(1);
}

const uploadArgs = [
  sentryCli,
  'sourcemaps',
  'upload',
  '--org',
  org,
  '--project',
  project,
];
if (release) uploadArgs.push('--release', release);
uploadArgs.push(distDir);

const upload = spawnSync(uploadArgs[0], uploadArgs.slice(1), { stdio: 'inherit', env: cliEnv });
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
