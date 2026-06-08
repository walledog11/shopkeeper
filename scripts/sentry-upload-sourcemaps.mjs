#!/usr/bin/env node
console.log('[shopkeeper/sentry-upload] script invoked');

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env, argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  hasSentryUploadCredentials,
  isDeployBuild,
  missingSentryUploadVars,
  resolveSentryRelease,
} from './sentry-release.mjs';

const distDir = argv.find((arg) => !arg.startsWith('-')) || 'dist';
const stripPublicMaps = argv.includes('--strip-public-maps');
const requireUpload = argv.includes('--require') || isDeployBuild(env);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sentryCli = join(repoRoot, 'node_modules', '.bin', 'sentry-cli');

if (!hasSentryUploadCredentials(env)) {
  const missing = missingSentryUploadVars(env);
  const message = `[sentry] Missing source map upload env: ${missing.join(', ')}`;

  if (requireUpload) {
    console.error(`${message} (required on deploy builds)`);
    console.error('[sentry] Set SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT in the build environment.');
    exit(1);
  }

  console.log(`[sentry] Skipping source map upload — ${message}`);
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
const cliEnv = { ...env, SENTRY_LOG_LEVEL: env.SENTRY_LOG_LEVEL || 'info' };

console.log(
  `[sentry] Uploading source maps from ${distDir} to ${org}/${project}${
    release ? ` (release ${release})` : ' (no release env — set SENTRY_RELEASE or deploy commit sha)'
  }`,
);

runSentryCli(['info'], cliEnv);

const injected = runSentryCli(
  ['sourcemaps', 'inject', '--org', org, '--project', project, distDir],
  cliEnv,
);
if (!injected) {
  exit(1);
}

const uploadArgs = ['sourcemaps', 'upload', '--org', org, '--project', project];
if (release) uploadArgs.push('--release', release);
uploadArgs.push(distDir);

const uploaded = runSentryCli(uploadArgs, cliEnv);
if (!uploaded) {
  exit(1);
}

if (stripPublicMaps) {
  const removed = removePublicSourceMaps(join(distDir, 'static'));
  if (removed > 0) {
    console.log(`[sentry] removed ${removed} public client source map file(s)`);
  }
}

console.log(`[sentry] source maps uploaded${release ? ` for release ${release}` : ''}`);

function runSentryCli(args, cliEnv) {
  const result = spawnSync(sentryCli, args, { stdio: 'inherit', env: cliEnv });
  if (result.status !== 0) {
    console.error(`[sentry] sentry-cli ${args.join(' ')} failed`);
    return false;
  }
  return true;
}

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
