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
  // Shared local service targets win over legacy app files. Shell overrides win last.
  '.env.development.local',
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
  GATEWAY_ENABLE_MAINTENANCE_WORKERS: 'false',
  PRODUCT_ANALYTICS_ENABLED: 'false',
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
    NODE_ENV: 'development',
    SHOPKEEPER_LOCAL_DEV: 'true',
  };
}

export function assertLocalDevEnv(env) {
  for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'REDIS_URL']) {
    let url;
    try { url = new URL(env[name]); } catch {
      throw new Error(`[dev] ${name} is missing or invalid. Run npm run dev:setup.`);
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error(`[dev] ${name} must point to localhost. Use deployment tooling for remote environments.`);
    }
    if (name !== 'REDIS_URL' && (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/shopkeeper_dev')) {
      throw new Error(`[dev] ${name} must use the shopkeeper_dev PostgreSQL database, separate from clerk_test.`);
    }
    if (name === 'REDIS_URL' && (url.protocol !== 'redis:' || url.pathname !== '/1')) {
      throw new Error('[dev] REDIS_URL must use local Redis database /1; integration tests use /0.');
    }
  }
  const database = new URL(env.DATABASE_URL);
  const direct = new URL(env.DIRECT_DATABASE_URL);
  if (database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('[dev] DATABASE_URL and DIRECT_DATABASE_URL must target the same local database.');
  }
  for (const name of ['DASHBOARD_URL', 'DASHBOARD_INTERNAL_URL', 'GATEWAY_INTERNAL_URL']) {
    let url;
    try { url = new URL(env[name]); } catch {
      throw new Error(`[dev] ${name} is missing or invalid. Run npm run dev:setup.`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error(`[dev] ${name} must point to a local app. Configure provider callbacks separately.`);
    }
  }
  if (env.NEON_SERVERLESS_HTTP === 'true') {
    throw new Error('[dev] NEON_SERVERLESS_HTTP must be false for local PostgreSQL.');
  }
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
  const gateway = command[0] === '--gateway';
  if (gateway) command.shift();
  if (command.length === 0) {
    console.error('[with-dev-env] Missing command to execute');
    process.exit(1);
  }

  const env = getDevEnv(process.env);
  assertLocalDevEnv(env);
  const missing = missingDashboardDevEnv(env).filter(name => !gateway || name !== 'CLERK_SECRET_KEY');
  if (missing.length > 0) {
    console.error(`[with-dev-env] Missing development environment variables: ${missing.join(', ')}`);
    console.error('[with-dev-env] Add them to apps/dashboard/.env.local or a shared local env file.');
    process.exit(1);
  }

  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env,
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }

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
