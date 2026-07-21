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

export function loadLocalEnv() {
  for (const envPath of ENV_FILE_PATHS) {
    try {
      const parsed = dotenv.parse(readFileSync(envPath));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }
}
