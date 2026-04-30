import { clearOutboundRecords, resetTestData } from './test-infra.mjs';

export default async function globalTeardown() {
  if (process.env.E2E_SKIP_DB_CLEANUP === 'true') {
    return;
  }

  await resetTestData(process.env);
  await clearOutboundRecords(process.env);
}
