#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ARTIFACT_DIRECTORY_NAMES = [
  '.turbo',
  '.next',
  '.next-e2e',
  'coverage',
  'dist',
  'playwright-report',
  'test-results',
  '.nyc_output',
];

const SCAN_SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  ...ARTIFACT_DIRECTORY_NAMES,
]);

const MODE_DETAILS = {
  artifacts: [
    'Known ignored build/test cache directories in the repo root and workspaces:',
    `  ${ARTIFACT_DIRECTORY_NAMES.map((name) => `${name}/`).join(', ')}`,
    'Repo-wide TypeScript incremental build files:',
    '  *.tsbuildinfo',
    'This mode does not remove .env files, app-local Clerk.com auth config, lockfiles, or node_modules.',
  ],
  deps: [
    'Dependency directories only:',
    '  node_modules/ in the repo root and each workspace',
    'This mode does not remove lockfiles, env files, source files, or build/test cache directories.',
  ],
};

function parseArgs(argv) {
  let mode = 'artifacts';
  let dryRun = false;

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true, mode, dryRun };
    }

    if (arg === 'artifacts' || arg === 'deps') {
      mode = arg;
      continue;
    }

    throw new Error(`Unknown argument "${arg}". Use artifacts, deps, --dry-run, or --help.`);
  }

  return { help: false, mode, dryRun };
}

function printHelp() {
  console.log('Usage: node ./scripts/clean.mjs [artifacts|deps] [--dry-run]');
  console.log('');
  console.log('Modes:');
  console.log('  artifacts  Remove ignored build/test artifacts. This is the default.');
  console.log('  deps       Remove node_modules directories from the repo root and workspaces.');
  console.log('');
  console.log('Options:');
  console.log('  -n, --dry-run  Print matching paths without deleting them.');
}

function printScope(mode, dryRun) {
  console.log(`[clean] Mode: ${mode}${dryRun ? ' (dry run)' : ''}`);
  console.log('[clean] Scope:');

  for (const detail of MODE_DETAILS[mode]) {
    console.log(`[clean] ${detail}`);
  }
}

function assertInsideRepo(targetPath) {
  const resolvedPath = resolve(targetPath);

  if (resolvedPath !== REPO_ROOT && !resolvedPath.startsWith(`${REPO_ROOT}${sep}`)) {
    throw new Error(`Refusing to clean path outside the repo: ${targetPath}`);
  }

  return resolvedPath;
}

function addTarget(targets, targetPath) {
  const resolvedPath = assertInsideRepo(targetPath);

  if (existsSync(resolvedPath)) {
    targets.add(resolvedPath);
  }
}

async function readWorkspaceDirectories() {
  const packageJsonPath = join(REPO_ROOT, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const workspacePatterns = Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces
    : packageJson.workspaces?.packages ?? [];
  const workspaceDirectories = new Set();

  for (const pattern of workspacePatterns) {
    if (!pattern.endsWith('/*')) {
      continue;
    }

    const baseDirectory = pattern.slice(0, -2);
    const absoluteBaseDirectory = join(REPO_ROOT, baseDirectory);

    if (!existsSync(absoluteBaseDirectory)) {
      continue;
    }

    const entries = await readdir(absoluteBaseDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        workspaceDirectories.add(join(absoluteBaseDirectory, entry.name));
      }
    }
  }

  return [...workspaceDirectories].sort();
}

async function collectTsBuildInfoTargets(directory, targets) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SCAN_SKIP_DIRECTORY_NAMES.has(entry.name)) {
        await collectTsBuildInfoTargets(fullPath, targets);
      }

      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) {
      addTarget(targets, fullPath);
    }
  }
}

async function collectArtifactTargets() {
  const targets = new Set();
  const cleanupRoots = [REPO_ROOT, ...(await readWorkspaceDirectories())];

  for (const cleanupRoot of cleanupRoots) {
    for (const directoryName of ARTIFACT_DIRECTORY_NAMES) {
      addTarget(targets, join(cleanupRoot, directoryName));
    }
  }

  await collectTsBuildInfoTargets(REPO_ROOT, targets);

  return sortTargets(targets);
}

async function collectDependencyTargets() {
  const targets = new Set();
  const cleanupRoots = [REPO_ROOT, ...(await readWorkspaceDirectories())];

  for (const cleanupRoot of cleanupRoots) {
    addTarget(targets, join(cleanupRoot, 'node_modules'));
  }

  return sortTargets(targets);
}

function sortTargets(targets) {
  return [...targets].sort((left, right) => relative(REPO_ROOT, left).localeCompare(relative(REPO_ROOT, right)));
}

function formatTarget(targetPath) {
  const relativePath = relative(REPO_ROOT, targetPath);

  return relativePath === '' ? '.' : relativePath;
}

async function cleanTargets(targets, dryRun) {
  if (targets.length === 0) {
    console.log('[clean] No matching paths found.');
    return;
  }

  console.log('[clean] Matching paths:');

  for (const target of targets) {
    console.log(`[clean] - ${formatTarget(target)}`);
  }

  if (dryRun) {
    console.log('[clean] Dry run complete. No files were deleted.');
    return;
  }

  for (const target of targets) {
    await rm(target, { recursive: true, force: true });
  }

  console.log(`[clean] Removed ${targets.length} path${targets.length === 1 ? '' : 's'}.`);
}

async function main() {
  const { help, mode, dryRun } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  printScope(mode, dryRun);

  const targets = mode === 'deps' ? await collectDependencyTargets() : await collectArtifactTargets();
  await cleanTargets(targets, dryRun);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
