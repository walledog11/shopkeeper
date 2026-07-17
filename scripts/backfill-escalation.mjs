#!/usr/bin/env node
// P5-04 historical backfill: flip live `pending` threads to `open` + `escalated_at`.
//
// Escalation is now an orthogonal flag (P5-04); historical escalations are still
// parked at status `pending`, where they are invisible in the open inbox and
// split inbound follow-ups off into a second, context-less thread. This flips
// them back to `open` and stamps `escalated_at` (using `updated_at` as the
// handoff time, which preserves chronological ordering for the "Waiting on you"
// surface).
//
// SAFETY: refuses to write while any open+pending collision exists (see
// escalation-backfill-lib.mjs) — those groups must be resolved by hand first
// (merge/close the duplicate) or the flip would violate the
// `threads_one_open_per_customer` unique index. Dry-run by default; pass
// --execute to apply. The safety check is re-run inside the write transaction so
// a collision appearing between report and apply still blocks the write.
//
//   npm run backfill:escalation                # report only (dry run)
//   npm run backfill:escalation -- --execute   # apply
import { db } from '@shopkeeper/db';
import { computeEscalationBackfillReport } from './escalation-backfill-lib.mjs';

const execute = process.argv.includes('--execute');

async function main() {
  const report = await computeEscalationBackfillReport(db);
  console.log(JSON.stringify(report, null, 2));

  if (!report.safeToBackfill) {
    console.error(
      `[backfill:escalation] refusing: ${report.collisionGroupCount} open+pending collision group(s) must be resolved first (merge/close the duplicate). Nothing written.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!execute) {
    console.log(
      `[backfill:escalation] dry run — ${report.pendingThreadsToBackfill} pending thread(s) would become open + escalated_at. Re-run with --execute to apply.`,
    );
    return;
  }

  const flipped = await db.$transaction(async (tx) => {
    const txReport = await computeEscalationBackfillReport(tx);
    if (!txReport.safeToBackfill) return -1;
    return tx.$executeRaw`
      UPDATE threads
      SET status = 'open',
          escalated_at = COALESCE(escalated_at, updated_at)
      WHERE status = 'pending'
        AND deleted_at IS NULL
        AND archived_at IS NULL
    `;
  });

  if (flipped < 0) {
    console.error(
      '[backfill:escalation] refusing: an open+pending collision appeared between report and apply. Nothing written.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[backfill:escalation] applied — flipped ${flipped} pending thread(s) to open + escalated_at.`,
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}
