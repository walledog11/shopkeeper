// P5-03 relational tenant-consistency gate (READ-ONLY).
//
// Reports parent/child rows whose redundant organization IDs disagree across
// the highest-risk message, thread, action/execution, and knowledge-base
// relationships. Samples contain UUIDs only: no message, customer, or KB text.
// The script never repairs data or adds constraints.
//
//   npm run audit:tenant-consistency
//   npm run audit:tenant-consistency -- --strict
//   npm run audit:tenant-consistency -- --sample-limit=100
import { computeTenantConsistencyReport, db } from '@shopkeeper/db';

function parseSampleLimit() {
  const prefix = '--sample-limit=';
  const raw = process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return 50;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('--sample-limit must be an integer between 1 and 1000');
  }
  return value;
}

const strict = process.argv.includes('--strict');
try {
  const report = await computeTenantConsistencyReport(db, { sampleLimit: parseSampleLimit() });

  console.log(JSON.stringify(report, null, 2));

  if (strict && !report.safeToConstrain) {
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
