import { clearOutboundRecords, runCommand, resetTestData, seedE2ETestData, waitForAllTestServices } from './test-infra.mjs';

export default async function globalSetup() {
  await runCommand('npm', ['run', 'db:generate', '-w', 'packages/db']);
  await runCommand('npm', ['run', 'build', '-w', 'packages/db']);

  try {
    await waitForAllTestServices(process.env, { timeoutMs: 30_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n[playwright-global-setup] Start local test services with: npm run test:services:up`);
  }

  await runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema=packages/db/prisma/schema.prisma']);
  await resetTestData(process.env);
  await clearOutboundRecords(process.env);
  await seedE2ETestData(process.env);
}
