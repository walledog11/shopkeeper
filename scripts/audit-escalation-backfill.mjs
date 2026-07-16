// P5-04 staged-backfill gate (READ-ONLY).
//
// The app layer now keeps escalated tickets `open` and records `escalated_at`,
// but historical escalations are still parked at status `pending`. Backfilling
// them (`pending -> open` + `escalated_at`) is safe only where it will not leave
// two `open` threads for the same (org, customer, channel) — that would violate
// the `threads_one_open_per_customer` partial unique index (`WHERE status =
// 'open'`).
//
// This script reports the backfill candidate count and lists the collision
// groups a human must resolve first (merge/close the duplicate). It writes
// nothing. Collision detection is shared with backfill-escalation.mjs via
// escalation-backfill-lib.mjs so the gate and the writer cannot drift.
//
//   npm run audit:escalation-backfill
//   npm run audit:escalation-backfill -- --strict   # exit 1 if collisions exist
import { db } from '@shopkeeper/db';
import { computeEscalationBackfillReport } from './escalation-backfill-lib.mjs';

const strict = process.argv.includes('--strict');

const report = await computeEscalationBackfillReport(db);

console.log(JSON.stringify(report, null, 2));

if (strict && !report.safeToBackfill) {
  process.exitCode = 1;
}

await db.$disconnect();
