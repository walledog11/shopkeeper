import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resetTestData, runCommand, waitForAllTestServices } from './test-infra.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  await runCommand('npm', ['run', 'build', '-w', 'packages/db'], { cwd: REPO_ROOT });
  await runCommand('npm', ['run', 'build', '-w', 'packages/email'], { cwd: REPO_ROOT });
  await runCommand('npm', ['run', 'build', '-w', 'packages/agent'], { cwd: REPO_ROOT });
  await runCommand('npm', ['run', 'build', '-w', 'packages/analytics'], { cwd: REPO_ROOT });

  try {
    await waitForAllTestServices(process.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n[test-bootstrap] Start local test services with: npm run test:services:up`);
  }

  await runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema=packages/db/prisma/schema.prisma'], {
    cwd: REPO_ROOT,
  });
  // Local Docker volumes and CI service volumes are intentionally reusable.
  // Start each root integration/coverage suite from an empty test database so
  // durable audit tables without parent foreign keys cannot leak across runs.
  await resetTestData(process.env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
