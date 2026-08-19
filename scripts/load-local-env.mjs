import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE_PATHS = [
  path.join(REPO_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, 'packages/db/.env'),
  path.join(REPO_ROOT, 'packages/db/.env.local'),
  path.join(REPO_ROOT, 'apps/dashboard/.env'),
  path.join(REPO_ROOT, 'apps/dashboard/.env.local'),
  path.join(REPO_ROOT, 'apps/gateway/.env'),
  path.join(REPO_ROOT, 'apps/gateway/.env.local'),
];

// Production is opt-in and named. `packages/db/.env` used to hold the Neon URL,
// which made every consumer of this loader a production tool by default and the
// Prisma CLI a production tool by accident. Prepended because the loop below is
// first-write-wins, so this beats the local file.
const PROD_ENV_FILE = path.join(REPO_ROOT, 'packages/db/.env.production');

function describeTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) return 'DATABASE_URL unset';
  const host = url.match(/@([^/]+)\//)?.[1] ?? 'unparseable';
  return /neon\.tech/.test(host) ? `PRODUCTION ${host}` : host;
}

/**
 * @param {{ announce?: boolean }} [options] - `announce: false` silences the
 *   target line for scripts that emit machine-readable output.
 */
export function loadLocalEnv(options = {}) {
  const wantsProd = process.env.SHOPKEEPER_DB_TARGET === 'prod';
  const paths = wantsProd ? [PROD_ENV_FILE, ...ENV_FILE_PATHS] : ENV_FILE_PATHS;

  for (const envPath of paths) {
    try {
      const parsed = dotenv.parse(readFileSync(envPath));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  // The 2026-08-14 mis-targeted migration was silent; its only tell was a
  // Datasource line nobody read. Say the target out loud, every run.
  if (options.announce !== false) {
    console.error(`[env] database target: ${describeTarget()}`);
    if (wantsProd) console.error('[env] SHOPKEEPER_DB_TARGET=prod — writes hit real merchant data.');
  }
}
