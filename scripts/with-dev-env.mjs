import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENV_FILE_PATHS = [
  '.env',
  '.env.local',
  'packages/db/.env',
  'packages/db/.env.local',
  'apps/gateway/.env',
  'apps/gateway/.env.local',
  'apps/dashboard/.env',
  'apps/dashboard/.env.local',
];

const CLERK_E2E_FALLBACK_PATHS = ['.env.e2e.local'];
const CLERK_E2E_FALLBACK_KEYS = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
];

const DASHBOARD_DEV_REQUIRED = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'ANTHROPIC_API_KEY',
  'INTERNAL_API_SECRET',
];

const DEV_DEFAULTS = {
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/login',
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/signup',
  GATEWAY_INTERNAL_URL: 'http://localhost:8080',
};

export function getDevEnv(baseEnv = process.env, options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const fileEnv = loadEnvFiles(repoRoot, ENV_FILE_PATHS);
  const clerkFallbackEnv = loadAllowedEnvKeys(
    repoRoot,
    CLERK_E2E_FALLBACK_PATHS,
    CLERK_E2E_FALLBACK_KEYS,
  );

  return {
    ...DEV_DEFAULTS,
    ...clerkFallbackEnv,
    ...fileEnv,
    ...baseEnv,
  };
}

function loadEnvFiles(repoRoot, relativePaths) {
  return relativePaths.reduce((acc, relativePath) => {
    const parsed = readEnvFile(path.join(repoRoot, relativePath));
    return parsed ? { ...acc, ...parsed } : acc;
  }, {});
}

function loadAllowedEnvKeys(repoRoot, relativePaths, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const loaded = loadEnvFiles(repoRoot, relativePaths);
  return Object.fromEntries(
    Object.entries(loaded).filter(([key]) => allowed.has(key)),
  );
}

function readEnvFile(envPath) {
  try {
    return dotenv.parse(readFileSync(envPath));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function missingDashboardDevEnv(env) {
  return DASHBOARD_DEV_REQUIRED.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

async function main() {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error('[with-dev-env] Missing command to execute');
    process.exit(1);
  }

  const env = getDevEnv(process.env);
  const missing = missingDashboardDevEnv(env);
  if (missing.length > 0) {
    console.error(`[with-dev-env] Missing dashboard dev environment variables: ${missing.join(', ')}`);
    console.error('[with-dev-env] Add them to apps/dashboard/.env.local or a shared local env file.');
    process.exit(1);
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env,
  });

  child.on('error', (error) => {
    console.error('[with-dev-env] Failed to start command', error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
