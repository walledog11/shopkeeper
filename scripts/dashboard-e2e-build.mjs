import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD_DIR = path.join(REPO_ROOT, 'apps/dashboard');
const E2E_DIST_DIR = path.join(DASHBOARD_DIR, '.next-e2e');
const DEFAULT_DIST_DIR = path.join(DASHBOARD_DIR, '.next');

if (path.basename(E2E_DIST_DIR) !== '.next-e2e' || path.dirname(E2E_DIST_DIR) !== DASHBOARD_DIR) {
  throw new Error(`[dashboard-e2e-build] Refusing to clean unexpected path: ${E2E_DIST_DIR}`);
}

if (path.basename(DEFAULT_DIST_DIR) !== '.next' || path.dirname(DEFAULT_DIST_DIR) !== DASHBOARD_DIR) {
  throw new Error(`[dashboard-e2e-build] Refusing to clean unexpected path: ${DEFAULT_DIST_DIR}`);
}

// Dev uses `.next-dev`; a leftover `.next` from `npm run build` can hold stale route
// types (e.g. removed pages) that Next still type-checks during the e2e dist build.
await rm(DEFAULT_DIST_DIR, { recursive: true, force: true });
await rm(E2E_DIST_DIR, { recursive: true, force: true });
await runNextBuild();

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['next', 'build'], {
      cwd: DASHBOARD_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_DIST_DIR: '.next-e2e',
      },
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[dashboard-e2e-build] next build exited with code ${code ?? 1}`));
    });
  });
}
